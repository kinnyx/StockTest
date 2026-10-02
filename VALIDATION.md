# Validation

- Frontend dependencies installed successfully; package-lock.json included.
- Resolved versions: Next.js 16.3.8, React 19.3.0.
- npm run typecheck: PASS.
- npm run build: PASS (production compilation, TypeScript, static prerender).
- Python integration test syntax: PASS (py_compile).
- ASP.NET Core build: NOT RUN — .NET SDK unavailable in generation environment.
- PostgreSQL/API integration and Docker Compose: NOT RUN — PostgreSQL and Docker unavailable.
- Browser interaction: NOT RUN.

Run the provided integration test against a fresh demo database before relying on the checkout workflow.
