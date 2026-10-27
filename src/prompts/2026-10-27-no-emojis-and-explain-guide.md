# No emojis, and a guide to explain the project

## Request
(1) No emojis: they are unnecessary tokens. (2) Ideas for more tools. (3) A PDF split in 6 parts on how to explain the project.

## Decisions
- **No emojis anywhere Kerni speaks.** The persona now says "no emojis, emoticons or decorative symbols: tenderness shows in the words and the rhythm", and its own text carries none. The fixed texts of the app (greeting, confirmations, errors, disk answers) and the backend fallbacks lost theirs. As a safety net, `quitarEmojis` strips any emoji the model still emits from the final answer (it keeps (c), (r) and the trademark sign and tidies the spaces). The developer console symbols of `probar-llm.js` were left alone: they are not Kerni's voice.
- Guards: a persona test (no emojis in the prompt, the instruction is there), a filter test with an end-to-end chat case, and a front test that scans the interface source for emojis so none comes back.
- `docs/como_explicar_kerni.pdf`: five pages, six parts (problem and idea, what it does today, how it thinks, how it knows what it knows, trust and safety, live demo and what comes next). Each part has the one-sentence idea, what to say, an easy analogy, what to show, a likely question with its answer and a bridge sentence to the next part, plus a cover with three rules for telling it well and the numbers worth remembering. The demo stays last and with one person. It states what was really tested and what is missing.
- Tool ideas were answered in the conversation, ranked by value and risk; none was implemented in this session.

## Verification
- Backend 166 tests, front 51. The PDF was rendered and read page by page; every figure in it comes from runs of this project (254 passages, 118 pages of manuals, 3 s scan, about 235 tests).
