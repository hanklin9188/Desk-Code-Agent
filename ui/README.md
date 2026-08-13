# Desk Code Agent UI/UX Package

Start with:

1. `UI_UX_SYSTEM.md`
2. `INFORMATION_ARCHITECTURE.md`
3. `ANIMATE_UI_INTEGRATION.md`
4. `MOTION_SYSTEM.md`
5. `COMPONENT_SPECS.md`
6. `PERFORMANCE_ACCESSIBILITY.md`
7. `PROTOTYPE_PLAN.md`
8. `wireframes.md`
9. `motion-storyboard.md`
10. `event-animation-map.yaml`
11. `design-tokens.example.json`

A working dependency-free prototype is in `../prototypes/desk-code-agent-motion-prototype.html`.

The production UI is event-driven. It must not block on LLM inference, run repository work on the UI thread, or derive state from model prose.
