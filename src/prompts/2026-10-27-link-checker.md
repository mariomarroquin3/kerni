# Is this site safe? A link checker

## Request
Can Kerni see my screen and tell me if a site is safe? After discussing the options the person chose path 1: paste the link and let Kerni check it.

## Decisions
- **Looking at the screen was not built.** A screenshot sent to a vision model can leak passwords or bank data and a good fake page looks like the real one, so it stays as a possible later step with a visible approval and a preview.
- **`revisar_enlace`, read-only.** It never opens the site. It looks at the address (`enlaces.js`) and, if `SAFE_BROWSING_API_KEY` is set, asks Google Safe Browsing (only the address is sent). Signals: HTTP, a number instead of a name, an `@` hiding the real destination, shorteners, look-alike characters (punycode), look-alike or misused brand names (`paypa1-login.com`, `paypal.com.cuenta-segura.xyz`), suspicious endings, many subdomains or hyphens, deceptive words, odd ports and hidden redirects. Scores map to `peligroso`, `dudoso` or `sin_senales`; unreadable input is `no_se_puede`.
- **Nothing is ever called "safe".** The best result is `sin_senales` and every answer carries a note that no check guarantees safety; the persona forbids saying "es seguro" and asks to advise not to type passwords, to go to the official address by typing it, and to change the password if data was already entered.
- **Two ways in.** The interface detects a short question about one link ("¿es seguro paypa1-login.com?") and calls `POST /enlaces/revisar` directly: instant and it spends no model quota. For longer, conversational messages the model calls the tool (up to 3 per turn). Two links in one message go to the model, which asks instead of guessing.
- Google being unreachable, rejecting the key or timing out never breaks the answer and never leaks the key; the result says the lists were not consulted.

## Findings while testing
- Scores were tuned after looking at real outputs: a shortened link listed its own reason yet came out "no signs", and the classic `paypal.com.<something>.xyz` trick only reached "doubtful". Shorteners now count 3, a brand in a subdomain 4 and a look-alike brand 5.
- The first real model run answered about a suspicious link without calling the tool (right content, but guessed). The persona now says to ALWAYS call the tool first; the second run called it in both cases.

## Verification
- Backend 198 tests (32 new: classification table, brand look-alikes, Google lookup with a fake `fetch` that proves only Google is contacted and the key never appears, failures, the tool, its per-turn limit and the route with its rate limit). Front 55 tests (detection of one link, no false positives, the summary never says "safe", wiring and no way to open the link from the interface).
- Real model through a throwaway backend (port 8799, stopped): suspicious link gave `peligroso` with clear advice; a Dell support link gave `sin_senales` and "it is not a full guarantee". Direct route answered in 4 to 86 ms.
- **Not run against the real Google Safe Browsing**: there is no key in this project, so that path is only tested with a fake `fetch`. Without a key Kerni says it only looked at the address.
