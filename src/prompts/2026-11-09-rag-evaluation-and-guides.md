# Measure the knowledge search, then fill its gaps

## Request
Is the Supabase vector knowledge base only Dell information? Can we add more and improve it? The person picked steps 1 and 2 of the plan: a measurement first, then the missing guides.

## Findings
- It is not only Dell: 21 Spanish guides (Windows, hardware, Office, good practices) plus two Dell Latitude 3120 manuals in English. Dell is 52 % of the fragments (213 of 409).
- Gaps: no guides for Wi-Fi, Bluetooth, sound or display, which are exactly the settings pages Kerni can now open.

## Decisions
- `npm run evaluar-rag` (`scripts/evaluar-rag.js`, pure logic in `src/rag/evaluacion.js`) runs 29 questions from `evaluacion/preguntas.json` against the real Supabase and reports how many find the expected document, how high, and whether off-topic questions bring nothing. It measures the agent's vector search or, with `--hibrido`, the chat fallback.
- A failed search (rate limit, network) is retried after a pause and only counted as a failure if it still fails. Before this, a minute-quota hiccup showed up as nine false misses.
- Baseline before adding content: 22 of 27 (81 %, MRR 0.77); the 5 misses were the topics with no guide. Hits had similarity 0.73 to 0.88 and misses 0.63 to 0.78, so raising the 0.55 threshold would not help. The threshold was left alone.
- Four new guides (`wifi-e-internet`, `bluetooth-y-dispositivos`, `sonido-y-audio`, `pantalla-y-resolucion`) written from the Microsoft Support pages read in the browser, same format as the existing guides, with the sources at the end. One sentence that no page backed up was removed. Where a page has more cases than the guide covers, the guide says to check the source.
- Indexed into the Supabase Cloud project: 43 new fragments, 409 unchanged.
- Not done: more manuals (needs the Government laptop models), OCR for scanned PDFs, reranking. Microsoft Learn is not bulk-loaded because its terms ask for personal, non-commercial use; the live `buscar_docs_microsoft` tool covers it.

## Verification
- After indexing: 27 of 27 (100 %), 25 in first place, MRR 0.96, with both the vector and the hybrid search; 2 of 2 off-topic questions rejected.
- Backend suite: 609 tests (7 new: scoring logic, failed searches never count as hits, and every expected document in the questions file exists in `conocimiento/`).
- Not checked: how the model words an answer using the new guides; only the retrieval was measured.
