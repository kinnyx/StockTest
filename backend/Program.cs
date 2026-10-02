using Npgsql;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSingleton(NpgsqlDataSource.Create(
    builder.Configuration.GetConnectionString("Stock")
    ?? "Host=localhost;Port=5432;Database=stock;Username=stock;Password=stock_dev"));
builder.Services.AddScoped<Store>();
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
    .WithOrigins(builder.Configuration["FrontendOrigin"] ?? "http://localhost:3000")
    .AllowAnyHeader().AllowAnyMethod()));
var app = builder.Build();
app.UseCors();
app.Use(async (context, next) =>
{
    try { await next(context); }
    catch (ApiError ex)
    {
        context.Response.StatusCode = ex.Status;
        await context.Response.WriteAsJsonAsync(new { message = ex.Message });
    }
});
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));
app.MapGet("/api/products", (Store db) => db.Products());
app.MapPost("/api/carts", (Store db) => db.CreateCart());
app.MapGet("/api/carts/{id:guid}", (Guid id, Store db) => db.Cart(id));
app.MapPut("/api/carts/{id:guid}/items/{code}", (Guid id, string code, QuantityRequest body, Store db) => db.SetQuantity(id, code, body.Quantity));
app.MapDelete("/api/carts/{id:guid}/items/{code}", (Guid id, string code, Store db) => db.SetQuantity(id, code, 0));
app.MapDelete("/api/carts/{id:guid}/items", (Guid id, Store db) => db.Clear(id));
app.MapPost("/api/carts/{id:guid}/checkout", (Guid id, Store db) => db.Checkout(id));
app.Run();

record QuantityRequest(int Quantity);
record Product(string Code, string Name, decimal Price, int OnHand, int Reserved, int Available);
record CartItem(string Code, string Name, decimal UnitPrice, int Quantity)
{
    public decimal LineTotal => UnitPrice * Quantity;
}
record CartView(Guid Id, string Status, List<CartItem> Items)
{
    public decimal Total => Items.Sum(i => i.LineTotal);
}
record Receipt(Guid OrderId, decimal Total, List<CartItem> Items);
sealed class ApiError(int status, string message) : Exception(message) { public int Status => status; }

sealed class Store(NpgsqlDataSource source)
{
    // A database-level transaction lock serializes demo mutations across API instances.
    // Production can replace this with ordered per-cart/per-stock row locks.
    static NpgsqlCommand Cmd(NpgsqlConnection c, string sql, params object[] values)
    {
        var cmd = new NpgsqlCommand(sql, c);
        foreach (var value in values) cmd.Parameters.Add(new NpgsqlParameter { Value = value });
        return cmd;
    }
    static async Task<int> Exec(NpgsqlConnection c, string sql, params object[] values)
    {
        await using var cmd = Cmd(c, sql, values); return await cmd.ExecuteNonQueryAsync();
    }
    static async Task<object?> Scalar(NpgsqlConnection c, string sql, params object[] values)
    {
        await using var cmd = Cmd(c, sql, values); return await cmd.ExecuteScalarAsync();
    }
    static async Task Lock(NpgsqlConnection c)
    {
        await Exec(c, "SELECT pg_advisory_xact_lock(8172401)");
    }
    static async Task Active(NpgsqlConnection c, Guid id)
    {
        var status = await Scalar(c, "SELECT status FROM carts WHERE id=$1", id);
        if (status is null) throw new ApiError(404, "ไม่พบตะกร้า");
        if ((string)status != "active") throw new ApiError(409, "ตะกร้านี้ชำระเงินแล้ว");
    }
    public async Task<List<Product>> Products()
    {
        await using var c = await source.OpenConnectionAsync();
        await using var cmd = Cmd(c, "SELECT p.code,p.name,p.price,s.on_hand,s.reserved,s.on_hand-s.reserved FROM products p JOIN stocks s ON s.product_code=p.code ORDER BY p.code");
        await using var reader = await cmd.ExecuteReaderAsync();
        var result = new List<Product>();
        while (await reader.ReadAsync()) result.Add(new(reader.GetString(0), reader.GetString(1), reader.GetDecimal(2), reader.GetInt32(3), reader.GetInt32(4), reader.GetInt32(5)));
        return result;
    }
    public async Task<object> CreateCart()
    {
        var id = Guid.NewGuid();
        await using var c = await source.OpenConnectionAsync();
        await Exec(c, "INSERT INTO carts(id) VALUES($1)", id);
        return new { id };
    }
    static async Task<CartView> ReadCart(NpgsqlConnection c, Guid id)
    {
        var status = await Scalar(c, "SELECT status FROM carts WHERE id=$1", id) as string
            ?? throw new ApiError(404, "ไม่พบตะกร้า");
        await using var cmd = Cmd(c, "SELECT p.code,p.name,p.price,i.quantity FROM cart_items i JOIN products p ON p.code=i.product_code WHERE i.cart_id=$1 ORDER BY p.code", id);
        await using var reader = await cmd.ExecuteReaderAsync();
        var items = new List<CartItem>();
        while (await reader.ReadAsync()) items.Add(new(reader.GetString(0), reader.GetString(1), reader.GetDecimal(2), reader.GetInt32(3)));
        return new(id, status, items);
    }
    public async Task<CartView> Cart(Guid id)
    {
        await using var c = await source.OpenConnectionAsync();
        await using var tx = await c.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead);
        var cart = await ReadCart(c, id); await tx.CommitAsync(); return cart;
    }
    public async Task<CartView> SetQuantity(Guid id, string code, int quantity)
    {
        if (quantity < 0 || quantity > 100000) throw new ApiError(400, "จำนวนต้องอยู่ระหว่าง 0 ถึง 100000");
        await using var c = await source.OpenConnectionAsync();
        await using var tx = await c.BeginTransactionAsync();
        await Lock(c); await Active(c, id);
        var available = await Scalar(c, "SELECT on_hand-reserved FROM stocks WHERE product_code=$1", code);
        if (available is null) throw new ApiError(404, "ไม่พบสินค้า");
        var old = (int?)await Scalar(c, "SELECT quantity FROM cart_items WHERE cart_id=$1 AND product_code=$2", id, code) ?? 0;
        var delta = quantity - old;
        if (delta > (int)available) throw new ApiError(409, "สินค้าในสต๊อกไม่เพียงพอ");
        await Exec(c, "UPDATE stocks SET reserved=reserved+$1 WHERE product_code=$2", delta, code);
        if (quantity == 0) await Exec(c, "DELETE FROM cart_items WHERE cart_id=$1 AND product_code=$2", id, code);
        else await Exec(c, "INSERT INTO cart_items VALUES($1,$2,$3) ON CONFLICT(cart_id,product_code) DO UPDATE SET quantity=EXCLUDED.quantity", id, code, quantity);
        var cart = await ReadCart(c, id); await tx.CommitAsync(); return cart;
    }
    public async Task<CartView> Clear(Guid id)
    {
        await using var c = await source.OpenConnectionAsync();
        await using var tx = await c.BeginTransactionAsync();
        await Lock(c); await Active(c, id);
        await Exec(c, "UPDATE stocks s SET reserved=s.reserved-i.quantity FROM cart_items i WHERE i.cart_id=$1 AND s.product_code=i.product_code", id);
        await Exec(c, "DELETE FROM cart_items WHERE cart_id=$1", id);
        var cart = await ReadCart(c, id); await tx.CommitAsync(); return cart;
    }
    static async Task<Receipt> ReadReceipt(NpgsqlConnection c, Guid orderId)
    {
        var total = (decimal)(await Scalar(c, "SELECT total FROM orders WHERE id=$1", orderId))!;
        await using var cmd = Cmd(c, "SELECT product_code,name,unit_price,quantity FROM order_items WHERE order_id=$1 ORDER BY product_code", orderId);
        await using var reader = await cmd.ExecuteReaderAsync();
        var items = new List<CartItem>();
        while (await reader.ReadAsync()) items.Add(new(reader.GetString(0), reader.GetString(1), reader.GetDecimal(2), reader.GetInt32(3)));
        return new(orderId, total, items);
    }
    public async Task<Receipt> Checkout(Guid id)
    {
        await using var c = await source.OpenConnectionAsync();
        await using var tx = await c.BeginTransactionAsync();
        await Lock(c);
        // cart_id is unique: retrying a checkout returns the same receipt, never deducts twice.
        var existing = await Scalar(c, "SELECT id FROM orders WHERE cart_id=$1", id);
        if (existing is Guid previous)
        {
            var receipt = await ReadReceipt(c, previous); await tx.CommitAsync(); return receipt;
        }
        await Active(c, id);
        var cart = await ReadCart(c, id);
        if (cart.Items.Count == 0) throw new ApiError(400, "ตะกร้าว่าง ไม่สามารถชำระเงินได้");
        var orderId = Guid.NewGuid();
        await Exec(c, "INSERT INTO orders(id,cart_id,total) VALUES($1,$2,$3)", orderId, id, cart.Total);
        foreach (var item in cart.Items)
        {
            var changed = await Exec(c, "UPDATE stocks SET on_hand=on_hand-$1,reserved=reserved-$1 WHERE product_code=$2 AND on_hand >= $1 AND reserved >= $1", item.Quantity, item.Code);
            if (changed != 1) throw new ApiError(409, "สต๊อกไม่สอดคล้อง กรุณาลองใหม่");
            await Exec(c, "INSERT INTO order_items VALUES($1,$2,$3,$4,$5)", orderId, item.Code, item.Name, item.UnitPrice, item.Quantity);
        }
        await Exec(c, "DELETE FROM cart_items WHERE cart_id=$1", id);
        await Exec(c, "UPDATE carts SET status='completed' WHERE id=$1", id);
        await tx.CommitAsync(); return new(orderId, cart.Total, cart.Items);
    }
}
