# Copilot Instructions for live-translator

## Development workflow
- When you modify any files under apps/extension, automatically rebuild the extension by running `npm run build` from apps/extension.
- When you modify any files under apps/server, determine whether the server must be restarted (e.g., changes to Python code, routes, or configuration). If so, restart the server by running `./start.ps1` from apps/server.

## Notes
- Prefer keeping changes minimal and consistent with existing code style.
- After rebuild or restart, report the action taken and any errors.
