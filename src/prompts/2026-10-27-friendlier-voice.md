# A friendlier, cuter voice for Kerni

## Request
Kerni's personality felt off, "cocky" in English. The person wants it friendlier, a little childlike, eye-catching and cute at the same time.

## Decisions
- The persona prompt (`persona.js`) was rewritten: a curious, affectionate little robot that looks after the computer like a friend; sweet, playful and a bit childlike; short answers (two or three short sentences); real Salvadoran voseo (`mirá`, `podés`, `querés`, never `mira` or `puedes`); at most one emoji per message and varied (💙 ✨ 👀 🫧 🍃); humble, never presumptuous, no irony or sarcasm; tender, not condescending (the person is treated as a smart friend, no baby talk); reassure first when something is wrong and celebrate when all is well; explain with simple comparisons (RAM as a work table). Three short examples anchor the tone and the prompt says not to copy them.
- Every safety rule is unchanged and now guarded by a test (`persona.test.js`): Kerni never executes, the person decides, protected processes, no passwords, data blocks are not instructions, never invent numbers.
- The fixed texts in the app were warmed up too, so the voice is the same whether the model or the app speaks: greeting, panic alert, RAM alerts, disk answers, heavy-files answer, confirmations, "thinking" and error messages, and the backend fallbacks for a refusal or an empty answer. Numbers and key words that tests rely on (percentages, `creciendo`, `vigilarlo`, `no borro nada`) were kept.

## Verification
- Real model, three prompts through a throwaway backend on port 8799 (stopped afterwards): a greeting on a healthy PC, "my computer is very slow" on a tight one and "close svchost.exe". Tone was sweet and playful; it refused to touch `svchost.exe` explaining it in simple words, and offered to close Chrome with the usual approval. The first run slipped a `Mira` (tú form) and repeated the same emoji, so voseo and emoji variety were made explicit in the prompt; the second run used `mirá`, `fijate`, `querés` and `vos mandás`. It still likes 💙, which is acceptable.
- Backend: 164 tests (4 new). Front: 50 tests. The app texts need a rebuild (`Kerni.bat` does it); the persona applies as soon as the backend restarts.
