# Product Plus — China Marketplace Scout

Watches one product niche (a **Group**) across Chinese marketplaces and tells a merchant which listings sell, in which category, and which way they are moving.

## Language

### Fetching

**Group**:
One product niche being watched (e.g. Apple Watch bands), with its own keywords, taxonomy, budget and per-round cap.
_Avoid_: project, category, collection

**Keyword**:
What the merchant types once for a Group, in any language (e.g. "สายนาฬิกา Apple Watch"); it stands for one Platform term per watched platform.
_Avoid_: tag, query, concept

**Platform term**:
The search text actually sent to one platform for a Keyword, in that platform's own language (Chinese for Douyin, 1688 and Xiaohongshu; English for Temu); every Round searches each enabled Platform term.
_Avoid_: translation, variant

**Round**:
One scheduled or button-triggered fetch of every enabled Keyword of a Group, up to 50 listings per platform per Keyword; the only way listings enter a Group.
_Avoid_: sync, scrape, pipeline (in UI copy)

**Smoke test**:
A paid 5-listing run that checks whether an **actor** still works and returns the fields we need; recorded on the actor's evaluation, not on a Group.
_Avoid_: keyword test

**Keyword suggestion**:
A candidate Platform term proposed by AI from a product name; nothing is saved until the merchant picks it.
_Avoid_: recommendation, auto keyword

### Sorting

**Category**:
One line of a Group's taxonomy (key, names in three languages, keywords). A Round with an AI engine ready adds new Categories itself — marked as added by AI, editable in the text box — so a new Group needs only a Keyword.
_Avoid_: tag, type

**Unclassified**:
A listing that is the Group's kind of product but fits no Category yet; a sign the taxonomy needs a line.
_Avoid_: uncategorised, unknown

**Off-topic**:
A listing the search caught that is not the Group's kind of product at all (an Apple-branded snack in a watch-band Group). Set aside by AI, shown in its own lane, and left out of every count, share, trend and brand brief.
_Avoid_: junk, spam, unrelated
