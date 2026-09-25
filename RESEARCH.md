# Jib website — Phase 1 research summary

Tags: **[E]** documented evidence (primary source, study, or official docs) · **[V]** vendor/agency/third-party estimate — treat with caution · **[O]** opinion/judgement.

Research date: September 2026. No paid keyword tools (Ahrefs/Semrush) were used, so there are no search-volume numbers — competitiveness is judged from who currently ranks.

---

## 1. How apps have used content/SEO to drive installs

| App | What they did | What's actually proven | Relevance to Jib |
|---|---|---|---|
| **Zapier** | Programmatic pages from a real database: one page per app, one per app-pair ("connect X to Y"). Each page gets little traffic; the long tail adds up. | Best-documented case: [Ahrefs case study](https://ahrefs.com/blog/zapier-seo-case-study/) **[E]** | The mechanic works **only with real per-page data**. Jib's equivalent is job × state licensing pages, where each page genuinely differs. |
| **Canva** | Every template/tool page is a working tool that satisfies the search immediately. | Traffic figures (100M+/month) are third-party estimates **[V]** — [Foundation](https://foundationinc.co/lab/canva-seo) | Lesson: pages that *do something* (calculators, checkers) beat articles. |
| **Headspace / Calm** | Answer real long-tail questions, convert via trial CTA; Calm leaned heavily on YouTube. | Blog traffic figures are agency estimates **[V]** — [Grizzle](https://grizzle.io/blog/headspace), [Foundation](https://foundationinc.co/lab/calm-marketing-empire) | Closest consumer analogue: "answer the DIY question, then offer the next step in the app". |
| **Notion** | User-submitted templates each get an SEO page. | No company-published numbers **[V]** | Later option: a gallery of real user project plans. Needs users first. |
| **Duolingo** | Language guides + methodology blog, alongside huge social presence. | No disclosed numbers **[V]** | Low transferability — driven by brand and social as much as search. |
| **Niche/small apps** | — | **No well-documented small-app "blog → installs" case study was found.** Treat such claims as folklore. **[E: absence]** | Honest gap: you're partly in uncharted territory. |

**Web-to-app conversion:** deep-linked smart banners are the best-evidenced mechanism (IMDb +443% mobile-web installs, Jet.com 33% of installs via banner) — but these are Branch's own case studies **[V]** ([Branch](https://www.branch.io/guides/what-are-mobile-smart-banners/)).

---

## 2. Google SEO in 2026

- **Helpful content** is a site-wide machine-learning signal: lots of unhelpful pages drag down the whole site. **[E]** [Google — helpful content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- **Scaled content abuse policy** (since March 2024): many pages made mainly to rank, with little added value, is a violation whether written by AI or humans. Templated "[job] cost in [city]" pages without real local data are exactly this. **[E]** policy; traffic-loss figures (60–90%) are industry reports **[V]** ([digitalapplied](https://www.digitalapplied.com/blog/programmatic-seo-after-march-2026-surviving-scaled-content-ban))
- **E-E-A-T** is rater guidance used to train ranking systems, not a direct ranking factor. **[E]** Practical trust signals for a new site — named author, About page, contact, sources cited, dated updates, real project photos — are industry consensus **[O]**.
- **AI Overviews:** appear on roughly 25–50% of searches. With an overview, users clicked a normal result 8% of the time vs 15% without (Pew, 68,879 searches) **[E]**. Ahrefs found the #1 result's click-through drops 34.5–58% **[E]** ([Ahrefs](https://ahrefs.com/blog/ai-overviews-reduce-clicks/)). Being *cited inside* the overview is now as important as ranking.
- **AI answer engines (ChatGPT, Perplexity):** clear answer-first paragraphs under each heading, fresh dates, and not blocking AI crawlers in robots.txt are consistent industry advice, **not** confirmed by Google/OpenAI **[O]**.
- **Structured data:** FAQ and HowTo *visual* rich results are gone (HowTo 2023, FAQ May 2026) **[E/V]**. Article, Organization, Person and SoftwareApplication markup is still worth adding for clarity **[O]**.
- **Mobile-first indexing** is universal **[E]**. Core Web Vitals are a tiebreaker; static sites have a natural speed advantage **[O]**.
- **Sitemaps:** include only canonical, indexable, 200-status URLs; keep `lastmod` accurate; Google ignores `priority`/`changefreq` **[E]** ([Google — sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)).
- **New-domain timeline:** 3–6 months to rank for low-competition long-tail terms; 6–12+ months for anything competitive. Industry consensus, not a Google figure **[O]**.

---

## 3. Keyword opportunities (ranked)

| # | Cluster | Example searches | Competition | Converts to installs? |
|---|---|---|---|---|
| 1 | **"Can I legally DIY [job] in [state]"** | can I replace a power point myself Australia · can I replace a toilet myself NSW · can I waterproof my own bathroom · what plumbing can I do myself QLD | **Low–medium.** Results are weak tradie blogs, Whirlpool threads, and a **New Zealand** plumber ranking #1 for a NSW question **[E]** | **High** — asked at the DIY-or-hire decision, Jib's exact feature |
| 2 | **Council approval / permits** | deck council approval NSW · shed without approval QLD · retaining wall height without approval | **Low–medium.** Small builder blogs + council pages **[E]** | Medium–high (planning stage) |
| 3 | **Materials lists (AU)** | how many sleepers for a raised garden bed · materials list for a timber deck · what do I need to tile a bathroom floor | **Low–medium.** "Sleeper garden bed" results are dominated by **UK** timber merchants **[E]** | **High** — about to shop; matches the shopping list |
| 4 | Calculators | paint calculator Australia · tile calculator | **High** for head terms (Bunnings, Dulux, many new calculator microsites) **[E]** | Medium — build narrow combined ones later |
| 5 | Cost | cost to retile bathroom Australia · decking cost per m² Sydney | **Medium–high** (hipages, Airtasker, Canstar, whatsthedamage) **[E]** | Low — that traffic leans toward hiring |
| 6 | Planning/sequencing | bathroom renovation order of trades · cheap renovations before selling | Medium | Medium |

**Licensing rules genuinely differ by place** (why cluster 1 isn't thin content): in Australia fixed wiring is illegal to DIY in every state; the UK's Part P allows like-for-like socket swaps; Texas has a homeowner exemption with a permit; NZ has Schedule 1 exemptions. **[E]** (sources in the keyword research: [practicaldiy](https://www.practicaldiy.com/electrics/electrical-building-regs/electrical-part-p.php), [QLD ESO](https://www.electricalsafety.qld.gov.au/electrical-safety-home/dont-do-your-own-electrical-work), [building.govt.nz](https://www.building.govt.nz/projects-and-consents/planning-a-successful-build/scope-and-design/check-if-you-need-consents/building-work-that-doesnt-need-a-building-consent/work-you-can-do-without-a-building-consent))

**Caveat:** cluster 1 is "your money or your life"-adjacent (legal + safety). Google wants visible expertise, and errors could genuinely hurt readers. **[O]**

---

## 4. Competitors and gaps

- **hipages** — huge cost-guide library, but its business is selling leads to tradies (avg tradie spend $2,381/yr **[V]**), so it has no incentive to say "you can do this yourself". **[O]** (Couldn't open hipages pages directly — less certain.)
- **Oneflare → Airtasker** — Oneflare closed 30 June 2026 and redirects to Airtasker **[E]**. The bathroom cost guide it now points to was last updated January 2023, with no DIY steps, no licensing info and only one state mentioned **[E]** ([Airtasker](https://www.airtasker.com/au/costs/bathroom-renovation/new-bathroom-cost/)). Stale, mid-migration library = opening.
- **Bunnings D.I.Y. Advice** — the AU how-to heavyweight **[E]**, but on legality it defers ("rules differ between states, check yours") **[E]** and gives no costs or neutral DIY-vs-hire view.
- **Small AU legality blogs** (homeupkeep, idoityourself) — partial state tables, thin on waterproofing and owner-builder limits **[E]**. **Nobody has a complete, maintained trade × state matrix linked to the regulators.** **[O, supported by evidence]**
- **AU renovation calculators** — many, all budget-range tools; **none produce a materials-and-quantities list** (no AU equivalent of the US site Homewyse) **[O]**.
- **Direct AI app clones already exist:** FixMynd, YouFixedIt, HowToFix, AI Repair — "photo → plan, tools, materials, call a pro" **[E]** ([App Store](https://apps.apple.com/us/app/fixmynd-diy-home-repair-ai/id6766394491)). **The AI feature alone is not a differentiator.**
- **Home-management apps:** Centriq shut down January 2025 **[E/V]**; Homer/Dwellin/HomeZada focus on maintenance and appliances, not job planning.

---

## 5. Reader → download funnel (ranked by likely impact for a solo dev, no budget)

1. **In-text CTAs tied to the task** — in HubSpot's study, in-text anchor links produced 47–93% of each post's leads vs ~6% from end-of-post banners **[E]** ([HubSpot](https://blog.hubspot.com/marketing/blog-anchor-text-call-to-action-study)). Readers ignore anything that looks like an ad **[E]** ([NN/g](https://www.nngroup.com/articles/banner-blindness-original-eyetracking/)).
2. **Desktop → phone handoff** — most readers on desktop can't install a phone app. A QR code to a `/app` page that routes each phone to the right store is standard practice **[V]**.
3. **Smart App Banner** — `apple-itunes-app` meta tag; iOS Safari only, not Chrome on iOS **[E/V]**. Android has no real equivalent; Chrome's native-app prompt appears only when Chrome decides **[E]** ([Chrome](https://developer.chrome.com/blog/app-install-banners-native)). Use a small custom banner for Android. **[O]**
4. **Free web tools that preview the app** — a DIY legality checker and a materials calculator. Vendor "2x conversion" claims are unreliable **[V]**, but web-to-app funnels are now mainstream for subscription apps **[E/V]** ([RevenueCat](https://www.revenuecat.com/blog/growth/web-to-app-funnels)). Tools are also less exposed to AI Overviews **[O]**.
5. **Trust signals** — store rating + first 2–3 screenshots do most of the work; median ~7 seconds on a store page **[V]**. Privacy labels showing tracking sharply reduce install intent **[E]** ([USENIX 2024](https://www.usenix.org/system/files/soups2024-balash.pdf)). Keep the site and app free of tracking SDKs and say so.
6. **Free attribution** — App Store campaign links (`?pt=…&ct=…`, first download within 24h, needs ≥5 installs to show) **[E]** ([Apple](https://developer.apple.com/help/app-store-connect-analytics/acquisition/campaign-links/)); Google Play `referrer=` UTM links **[E]** ([Google Play](https://play.google.com/console/about/acquisitionreporting/)). Tag by content cluster, not by post, so each campaign clears Apple's 5-install threshold. **[O]**
7. **Deep links** — lower priority. Firebase Dynamic Links shut down 25 August 2025 **[E]**. Deferred deep linking needs a paid provider — skip at launch. **[O]**
8. **Email capture** — evidence is anecdotal **[V]**. One printable checklist PDF with a QR code on it is enough; no newsletter until there's traffic. **[O]**
