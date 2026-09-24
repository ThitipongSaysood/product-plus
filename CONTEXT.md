# Product Plus — China Marketplace Scout

Watches one product niche (a **Group**) across Chinese marketplaces and tells a merchant which listings sell, in which category, and which way they are moving.

## Language

### Fetching

**Group**:
One product niche being watched (e.g. Apple Watch bands), with its own keywords, taxonomy, budget and per-round cap.
_Avoid_: project, category, collection

**Keyword**:
A search term saved on a Group for one platform, written in that platform's own language; every Round searches it.
_Avoid_: tag, query

**Round**:
One scheduled or button-triggered fetch of every enabled Keyword of a Group, up to 50 listings per platform per Keyword; the only way listings enter a Group.
_Avoid_: sync, scrape, pipeline (in UI copy)

**Smoke test**:
A paid 5-listing run that checks whether an **actor** still works and returns the fields we need; recorded on the actor's evaluation, not on a Group.
_Avoid_: keyword test

**Keyword suggestion**:
A candidate Keyword proposed by AI from a product name, per platform and in that platform's own language; nothing is saved until the merchant picks it.
_Avoid_: recommendation, auto keyword
