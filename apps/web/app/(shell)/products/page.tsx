import Link from "next/link";
import type { Paged, ProductCard } from "@pp/contracts";
import { ApiErrorAlert } from "@/components/bits";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { ProductCardView, categoryLabel } from "@/components/ProductCardView";
import { ProductFilters } from "@/components/ProductFilters";
import { EmptyState } from "@/components/ui";
import { formatNumber } from "@/i18n";
import { getT } from "@/i18n/server";
import { api, qs } from "@/lib/api";
import { getPg, href } from "@/lib/params";
import { first } from "@/lib/platform";
import { loadGroup } from "@/lib/group";

export default async function ProductsPage(props: PageProps<"/products">) {
  const sp = await props.searchParams;
  const pg = getPg(sp);
  const t = await getT();
  const query = {
    pg,
    platform: first(sp.platform),
    category: first(sp.category),
    trend: first(sp.trend),
    period: first(sp.period),
    sort: first(sp.sort),
    q: first(sp.q),
    page: first(sp.page),
    active: first(sp.active),
  };
  const [res, g] = await Promise.all([api<Paged<ProductCard>>(`/products${qs(query)}`), loadGroup(pg)]);
  const taxonomy = g.group?.taxonomy ?? [];
  const compact = first(sp.density) === "compact";
  const from = href("/products", sp);
  const hasFilter = Boolean(query.platform || query.category || query.trend || query.period || query.q);

  return (
    <>
      <div className="ox-page-head">
        <div>
          <h1 className="ox-page-title">{t("products.title")}</h1>
          <p className="ox-muted">{t("products.sub")}</p>
        </div>
      </div>
      <ProductFilters platforms={g.platforms} categories={taxonomy.map((c) => ({ key: c.key, label: { th: c.th, en: c.en, zh: c.zh } }))} />
      {res.error ? (
        <ApiErrorAlert t={t} error={res.error} />
      ) : res.data.items.length === 0 ? (
        <EmptyState
          title={hasFilter ? t("products.emptyFiltered") : t("products.empty")}
          body={hasFilter ? t("products.emptyFilteredBody") : t("products.emptyBody")}
          action={hasFilter
            ? <Link className="ox-btn ox-btn--secondary" href={`/products${qs({ pg })}`}>{t("filter.clear")}</Link>
            : <Link className="ox-btn ox-btn--secondary" href={`/settings/keywords${qs({ pg })}`}>{t("products.goKeywords")}</Link>}
        />
      ) : (
        <>
          <p className="ox-xs ox-muted ox-num">{t("products.count", { n: formatNumber(t.locale, res.data.total) })}</p>
          <div className={compact ? "ap-wall ap-wall--compact" : "ap-wall"}>
            {res.data.items.map((p) => (
              <ProductCardView key={p.id} t={t} p={p} pg={pg} from={from} categoryText={categoryLabel(t, p.categoryKey, taxonomy)} />
            ))}
          </div>
          <Pager t={t} sp={sp} page={res.data.page} pageSize={res.data.pageSize} total={res.data.total} />
        </>
      )}
    </>
  );
}

function Pager({ t, sp, page, pageSize, total }: { t: Awaited<ReturnType<typeof getT>>; sp: Record<string, string | string[] | undefined>; page: number; pageSize: number; total: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav className="ox-row" aria-label={t("pager.label")} style={{ justifyContent: "center" }}>
      {page > 1
        ? <Link className="ox-btn ox-btn--secondary" href={href("/products", sp, { page: page - 1 })}><ChevronLeftIcon />{t("pager.prev")}</Link>
        : <span className="ox-btn ox-btn--secondary" aria-disabled="true"><ChevronLeftIcon />{t("pager.prev")}</span>}
      <span className="ox-num ox-muted">{t("pager.of", { page, pages })}</span>
      {page < pages
        ? <Link className="ox-btn ox-btn--secondary" href={href("/products", sp, { page: page + 1 })}>{t("pager.next")}<ChevronRightIcon /></Link>
        : <span className="ox-btn ox-btn--secondary" aria-disabled="true">{t("pager.next")}<ChevronRightIcon /></span>}
    </nav>
  );
}
