# Contributing

Thanks for wanting to contribute to **Growvia**! 🎉

## How to Contribute

1. Fork this repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes
4. Run `npm run check` and `npm test` to verify syntax and game logic
5. Commit: `git commit -m "feat: short description"`
6. Push: `git push origin feature/your-feature`
7. Open a Pull Request

## Commit Convention

Use conventional commits:
- `feat:` — new feature
- `fix:` — bug fix
- `docs:` — documentation changes
- `chore:` — maintenance tasks

## Rules

- Never commit `.env` or any secret (Discord token, Supabase key)
- Gameplay numbers live in `src/config/game.js` and `src/data/seeds.js`; keep `README.md` in sync
- Always update `README.md` if you change user-facing features
- Do not add new dependencies unless absolutely necessary

## License

By contributing, you agree that your contributions are published under the [Growvia Non-Commercial License](LICENSE).
