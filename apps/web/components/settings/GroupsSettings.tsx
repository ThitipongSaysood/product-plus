"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Group, Platform, Schedule, SourceMode } from "@pp/contracts";
import { formatMoney, formatNumber } from "@/i18n";
import { useT } from "@/i18n/client";
import { send } from "@/lib/client-api";
import { PLATFORM_LIST } from "@/lib/platform";
import { platformName } from "../bits";
import { EditIcon, PlusIcon, TrashIcon } from "../icons";
import { Alert, Button, Card, Checkbox, EmptyState, Field, Modal, SectionTitle, Select, TableScroll, TextInput } from "../ui";

// 0 = Sunday, matching Date#getUTCDay and the api column.
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
const HOURS = Array.from({ length: 24 }, (_, h) => h);

type Msg = { tone: "success" | "danger"; text: string } | null;

/** Same shape as the keywords page: one busy flag, one message, refresh the server data on success. */
function useSaver() {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  async function run<R>(fn: () => Promise<{ data?: R; error?: string }>, okText: string): Promise<R | null> {
    setBusy(true);
    setMsg(null);
    const r = await fn();
    setBusy(false);
    if (r.error) { setMsg({ tone: "danger", text: t.or(r.error, t("errors.http")) }); return null; }
    setMsg({ tone: "success", text: okText });
    router.refresh();
    return (r.data ?? null) as R | null;
  }
  return { busy, msg, run, setMsg };
}

const SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,58}[a-z0-9])?$/;

/** Mirrors slugify() on the api so the field shows the id that will actually be used. Kept identical
 *  on purpose — a divergence here would preview one id and create another. */
function slugFromName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 60)
    .replace(/^-+|-+$/g, "");
}

export function NewGroupForm({ groups }: { groups: Group[] }) {
  const t = useT();
  const s = useSaver();
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [platforms, setPlatforms] = useState<Platform[]>([...PLATFORM_LIST]);
  const [schedule, setSchedule] = useState<Schedule>("weekly");
  // 05:00 Monday is what every group ran on before the time was configurable — keep it as the default
  // so creating a group without touching these two fields behaves exactly as it used to.
  const [scheduleHour, setScheduleHour] = useState(5);
  const [scheduleWeekday, setScheduleWeekday] = useState(1);
  const [sourceMode, setSourceMode] = useState<SourceMode>("apify");
  const [budget, setBudget] = useState("0");
  const [copyFrom, setCopyFrom] = useState("");

  const effectiveSlug = slugTouched ? slug : slugFromName(name);
  const nameBad = name.trim() === "";
  const slugBad = !SLUG_RE.test(effectiveSlug);
  const noPlatform = platforms.length === 0;
  const budgetN = Number(budget);
  const budgetBad = budget.trim() === "" || !Number.isFinite(budgetN) || budgetN < 0;
  // The api rejects a per-round cap above a set budget; a new group keeps the $1 default cap.
  const budgetBlocksCap = !budgetBad && budgetN > 0 && budgetN < 1;
  const blocked = nameBad || slugBad || noPlatform || budgetBad || budgetBlocksCap;

  return (
    <Card>
      <SectionTitle title={t("groups.createTitle")} sub={t("groups.createSub")} />
      <form
        className="ox-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (blocked) return;
          const created = await s.run<Group>(
            () => send<Group>("POST", "/api/groups", {
              name: name.trim(),
              slug: effectiveSlug,
              platforms: PLATFORM_LIST.filter((p) => platforms.includes(p)),
              schedule,
              scheduleHour,
              scheduleWeekday,
              sourceMode,
              monthlyBudgetUsd: budgetN,
              ...(copyFrom ? { copyTaxonomyFrom: copyFrom } : {}),
            }),
            t("groups.created"),
          );
          // A new group has no keywords yet, so send them where they can add the first one.
          if (created) router.push(`/settings/keywords?pg=${encodeURIComponent(created.slug)}`);
        }}
      >
        <div className="ap-form-row ap-form-row--level">
          <Field label={t("groups.name")} htmlFor="ng-name" required help={t("groups.nameHelp")}>
            <TextInput id="ng-name" name="group-name" autoComplete="off" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-invalid={nameBad && name !== ""} />
          </Field>
          <Field
            label={t("groups.slug")}
            htmlFor="ng-slug"
            required
            help={t("groups.slugHelp")}
            error={slugBad && (slugTouched || name !== "") ? t("groups.slugInvalid") : undefined}
          >
            <TextInput
              id="ng-slug"
              name="group-slug"
              autoComplete="off"
              value={effectiveSlug}
              maxLength={60}
              spellCheck={false}
              onChange={(e) => { setSlugTouched(true); setSlug(e.target.value); }}
              aria-invalid={slugBad && (slugTouched || name !== "")}
            />
          </Field>
        </div>
        <fieldset className="ox-field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="ox-label">{t("group.platforms")}</legend>
          <div className="ox-row" style={{ gap: 16 }}>
            {PLATFORM_LIST.map((p) => (
              <Checkbox key={p} checked={platforms.includes(p)} label={platformName(t, p)} onChange={(v) => setPlatforms((cur) => (v ? [...cur, p] : cur.filter((x) => x !== p)))} />
            ))}
          </div>
          {noPlatform ? <div className="ox-error" role="alert">{t("group.platformsRequired")}</div> : <div className="ox-help">{t("group.platformsHelp")}</div>}
        </fieldset>
        <div className="ap-form-row ap-form-row--level">
          <Field label={t("groups.sourceMode")} htmlFor="ng-mode" help={t("groups.sourceModeHelp")}>
            <Select id="ng-mode" value={sourceMode} onChange={(e) => setSourceMode(e.target.value as SourceMode)}>
              <option value="apify">{t("groups.mode.apify")}</option>
              <option value="mock">{t("groups.mode.mock")}</option>
            </Select>
          </Field>
          <Field label={t("group.schedule")} htmlFor="ng-schedule" help={schedule === "manual" ? t("group.scheduleManualNote") : t("group.scheduleHelp")}>
            <Select id="ng-schedule" value={schedule} onChange={(e) => setSchedule(e.target.value as Schedule)}>
              {(["weekly", "daily", "manual"] as const).map((v) => <option key={v} value={v}>{t(`schedule.${v}`)}</option>)}
            </Select>
          </Field>
          {/* Both only mean anything for an automatic schedule; weekday only for a weekly one. */}
          {schedule === "weekly" ? (
            <Field label={t("group.scheduleWeekday")} htmlFor="ng-weekday" help={t("group.scheduleWeekdayHelp")}>
              <Select id="ng-weekday" value={String(scheduleWeekday)} onChange={(e) => setScheduleWeekday(Number(e.target.value))}>
                {WEEKDAYS.map((d) => <option key={d} value={d}>{t(`weekday.${d}`)}</option>)}
              </Select>
            </Field>
          ) : null}
          {schedule !== "manual" ? (
            <Field label={t("group.scheduleHour")} htmlFor="ng-hour" help={t("group.scheduleHourHelp")}>
              <Select id="ng-hour" value={String(scheduleHour)} onChange={(e) => setScheduleHour(Number(e.target.value))}>
                {HOURS.map((h) => <option key={h} value={h}>{`${String(h).padStart(2, "0")}:00`}</option>)}
              </Select>
            </Field>
          ) : null}
          <Field
            label={t("groups.budgetStart")}
            htmlFor="ng-budget"
            help={t("groups.budgetStartHelp")}
            error={budgetBad ? t("group.budgetInvalid") : budgetBlocksCap ? t("group.runCapOverBudget") : undefined}
          >
            <TextInput id="ng-budget" name="group-budget" autoComplete="off" type="number" min={0} step="0.5" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} aria-invalid={budgetBad || budgetBlocksCap} />
          </Field>
          <Field label={t("groups.copyTaxonomy")} htmlFor="ng-copy" help={t("groups.copyTaxonomyHelp")}>
            <Select id="ng-copy" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
              <option value="">{t("groups.copyTaxonomyNone")}</option>
              {groups.map((g) => <option key={g.slug} value={g.slug}>{g.name}</option>)}
            </Select>
          </Field>
        </div>
        <div>
          <Button type="submit" variant="primary" icon={<PlusIcon size={16} />} disabled={s.busy || blocked}>{t("groups.create")}</Button>
        </div>
        {s.msg ? <Alert tone={s.msg.tone}>{s.msg.text}</Alert> : null}
      </form>
    </Card>
  );
}

export function GroupsTable({ groups, pg }: { groups: Group[]; pg: string }) {
  const t = useT();
  const s = useSaver();
  const router = useRouter();
  const [renaming, setRenaming] = useState<Group | null>(null);
  const [newName, setNewName] = useState("");
  const [deleting, setDeleting] = useState<Group | null>(null);
  const [typed, setTyped] = useState("");
  const last = groups.length <= 1;

  return (
    <Card>
      <SectionTitle title={t("groups.listTitle")} />
      {groups.length === 0 ? (
        <EmptyState title={t("errors.group.notFound")} />
      ) : (
        <TableScroll label={t("groups.listTitle")}>
          <table className="ox-table ox-table--data">
            <thead>
              <tr>
                <th>{t("groups.name")}</th>
                <th>{t("groups.slug")}</th>
                <th className="ap-col-wide">{t("group.platforms")}</th>
                <th className="is-num">{t("groups.colProducts")}</th>
                <th className="is-num ap-col-wide">{t("group.budget")}</th>
                <th><span className="sr-only">{t("common.actions")}</span></th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.slug}>
                  <td>{g.name}</td>
                  <td><code>{g.slug}</code></td>
                  <td className="ap-col-wide">{g.platforms.map((p) => platformName(t, p)).join(" · ") || "—"}</td>
                  <td className="is-num">{formatNumber(t.locale, g.productCount ?? null)}</td>
                  <td className="is-num ap-col-wide">{formatMoney(t.locale, g.monthlyBudgetUsd, "USD")}</td>
                  <td>
                    <div className="ox-row">
                      <Link className="ox-btn ox-btn--ghost ox-btn--sm" href={`/overview?pg=${encodeURIComponent(g.slug)}`}>{t("groups.open")}</Link>
                      {/* Budget, cap, platforms, result count and schedule are edited by GroupForm at the
                          top of the keywords page. Linking there beats copying that form into a modal,
                          which would leave two places to keep in step. */}
                      <Link className="ox-btn ox-btn--ghost ox-btn--sm" href={`/settings/keywords?pg=${encodeURIComponent(g.slug)}`} aria-label={t("groups.settingsFor", { name: g.name })}>{t("groups.settings")}</Link>
                      <Button
                        size="sm"
                        variant="ghost"
                        iconOnly
                        aria-label={t("groups.rename", { name: g.name })}
                        icon={<EditIcon size={16} />}
                        disabled={s.busy}
                        onClick={() => { setRenaming(g); setNewName(g.name); s.setMsg(null); }}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        iconOnly
                        aria-label={last ? t("groups.lastOne") : t("groups.delete", { name: g.name })}
                        icon={<TrashIcon size={16} />}
                        disabled={s.busy || last}
                        onClick={() => { setDeleting(g); setTyped(""); s.setMsg(null); }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
      {s.msg ? <Alert tone={s.msg.tone}>{s.msg.text}</Alert> : null}

      {renaming ? (
        <Modal
          title={t("groups.renameTitle")}
          closeLabel={t("common.cancel")}
          onClose={() => setRenaming(null)}
          foot={
            <>
              <Button onClick={() => setRenaming(null)}>{t("common.cancel")}</Button>
              <Button
                variant="primary"
                disabled={s.busy || newName.trim() === ""}
                onClick={async () => {
                  const slug = renaming.slug;
                  setRenaming(null);
                  await s.run(() => send<Group>("PATCH", `/api/groups/${encodeURIComponent(slug)}`, { name: newName.trim() }), t("common.saved"));
                }}
              >
                {t("groups.renameSave")}
              </Button>
            </>
          }
        >
          <p className="ox-xs ox-muted">
            {t("groups.renameOnly")}{" "}
            <Link href={`/settings/keywords?pg=${encodeURIComponent(renaming.slug)}`}>{t("groups.toSettings")}</Link>
          </p>
          <Field label={t("groups.name")} htmlFor="rn-name" required help={t("groups.renameHelp", { slug: renaming.slug })}>
            <TextInput id="rn-name" name="group-rename" autoComplete="off" value={newName} maxLength={80} autoFocus onChange={(e) => setNewName(e.target.value)} />
          </Field>
        </Modal>
      ) : null}

      {deleting ? (
        <Modal
          title={t("groups.deleteTitle")}
          closeLabel={t("common.cancel")}
          onClose={() => setDeleting(null)}
          foot={
            <>
              <Button onClick={() => setDeleting(null)}>{t("common.cancel")}</Button>
              <Button
                variant="danger"
                disabled={s.busy || typed.trim() !== deleting.slug}
                onClick={async () => {
                  const gone = deleting;
                  setDeleting(null);
                  const ok = await s.run(() => send<{ ok: true }>("DELETE", `/api/groups/${encodeURIComponent(gone.slug)}`, { confirm: true }), t("groups.deleted"));
                  // Viewing the group that was just removed — drop ?pg= so the api answers for a surviving one.
                  if (ok && pg === gone.slug) router.push("/settings/groups");
                }}
              >
                {t("groups.deleteButton")}
              </Button>
            </>
          }
        >
          <Alert tone="danger">{t("groups.deleteBody", { name: deleting.name, products: formatNumber(t.locale, deleting.productCount ?? 0) })}</Alert>
          <Field label={t("groups.deleteTypeSlug", { slug: deleting.slug })} htmlFor="del-confirm">
            <TextInput id="del-confirm" name="group-delete-confirm" autoComplete="off" value={typed} autoFocus spellCheck={false} onChange={(e) => setTyped(e.target.value)} />
          </Field>
        </Modal>
      ) : null}
    </Card>
  );
}
