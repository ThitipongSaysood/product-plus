"use client";
// One editor for everything about a group that can change, used in two places: the card at the top of
// the keywords page and the modal behind the pencil in the groups list. Both write through the same
// PATCH, so they are the same component rather than two forms that would drift apart.
//
// The slug is not here on purpose — it is in every link ever shared, so the api refuses to change it.
import { useState } from "react";
import type { Group, Platform, Schedule } from "@pp/contracts";
import { useT } from "@/i18n/client";
import { PLATFORM_LIST } from "@/lib/platform";
import { platformName } from "../bits";
import { Checkbox, Field, Select, TextInput } from "../ui";

// 0 = Sunday, matching Date#getUTCDay and the api column.
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
const HOURS = Array.from({ length: 24 }, (_, h) => h);

export type GroupEdit = ReturnType<typeof useGroupEdit>;

export function useGroupEdit(group: Group) {
  const [name, setName] = useState(group.name);
  const [budget, setBudget] = useState(String(group.monthlyBudgetUsd));
  const [runCap, setRunCap] = useState(String(group.runCapUsd ?? 1));
  const [limit, setLimit] = useState(String(group.resultLimit));
  const [schedule, setSchedule] = useState<Schedule>(group.schedule);
  const [scheduleHour, setScheduleHour] = useState(group.scheduleHour);
  const [scheduleWeekday, setScheduleWeekday] = useState(group.scheduleWeekday);
  const [platforms, setPlatforms] = useState<Platform[]>(group.platforms);

  const budgetN = Number(budget);
  const runCapN = Number(runCap);
  const limitN = Number(limit);
  const nameBad = name.trim() === "";
  const budgetBad = budget.trim() === "" || !Number.isFinite(budgetN) || budgetN < 0;
  const runCapBad = !Number.isFinite(runCapN) || runCapN < 0.1;
  const limitBad = !Number.isInteger(limitN) || limitN < 1 || limitN > 50;
  // Mirrors capsValid() on the api: a cap above the budget could never be spent anyway.
  const capOverBudget = !runCapBad && !budgetBad && budgetN > 0 && runCapN > budgetN;

  return {
    group,
    name, setName, budget, setBudget, runCap, setRunCap, limit, setLimit,
    schedule, setSchedule, scheduleHour, setScheduleHour, scheduleWeekday, setScheduleWeekday,
    platforms, setPlatforms,
    nameBad, budgetBad, runCapBad, limitBad, capOverBudget,
    noPlatform: platforms.length === 0,
    blocked: nameBad || budgetBad || runCapBad || limitBad || capOverBudget || platforms.length === 0,
    /** The PATCH body. Order-stable platforms so the saved value does not depend on click order. */
    body: () => ({
      name: name.trim(),
      monthlyBudgetUsd: budgetN,
      runCapUsd: runCapN,
      resultLimit: limitN,
      schedule,
      scheduleHour,
      scheduleWeekday,
      platforms: PLATFORM_LIST.filter((p) => platforms.includes(p)),
    }),
  };
}

/** `id` prefixes every field id so the card and the modal can both be mounted without colliding. */
export function GroupFields({ e, id }: { e: GroupEdit; id: string }) {
  const t = useT();
  return (
    <>
      <Field label={t("groups.name")} htmlFor={`${id}-name`} required help={t("groups.renameHelp", { slug: e.group.slug })} error={e.nameBad ? t("groups.nameRequired") : undefined}>
        <TextInput id={`${id}-name`} name="group-name" autoComplete="off" value={e.name} maxLength={80} onChange={(ev) => e.setName(ev.target.value)} aria-invalid={e.nameBad} />
      </Field>
      <div className="ap-form-row ap-form-row--level">
        <Field label={t("group.budget")} htmlFor={`${id}-budget`} help={t("group.budgetHelp")} error={e.budgetBad ? t("group.budgetInvalid") : undefined}>
          <TextInput id={`${id}-budget`} type="number" min={0} step="0.5" inputMode="decimal" value={e.budget} onChange={(ev) => e.setBudget(ev.target.value)} aria-invalid={e.budgetBad} />
        </Field>
        <Field label={t("group.runCap")} htmlFor={`${id}-runcap`} help={t("group.runCapHelp")} error={e.runCapBad ? t("group.runCapInvalid") : e.capOverBudget ? t("group.runCapOverBudget") : undefined}>
          <TextInput id={`${id}-runcap`} type="number" min={0.1} step={0.05} inputMode="decimal" value={e.runCap} onChange={(ev) => e.setRunCap(ev.target.value)} aria-invalid={e.runCapBad || e.capOverBudget} />
        </Field>
        <Field label={t("group.limit")} htmlFor={`${id}-limit`} help={t("group.limitHelp")} error={e.limitBad ? t("group.limitInvalid") : undefined}>
          <TextInput id={`${id}-limit`} type="number" min={1} max={50} step={1} inputMode="numeric" value={e.limit} onChange={(ev) => e.setLimit(ev.target.value)} aria-invalid={e.limitBad} />
        </Field>
      </div>
      <div className="ap-form-row ap-form-row--level">
        <Field label={t("group.schedule")} htmlFor={`${id}-schedule`} help={e.schedule === "manual" ? t("group.scheduleManualNote") : t("group.scheduleHelp")}>
          <Select id={`${id}-schedule`} value={e.schedule} onChange={(ev) => e.setSchedule(ev.target.value as Schedule)}>
            {(["weekly", "daily", "manual"] as const).map((v) => <option key={v} value={v}>{t(`schedule.${v}`)}</option>)}
          </Select>
        </Field>
        {/* Both only mean anything for an automatic schedule; the weekday only for a weekly one. */}
        {e.schedule === "weekly" ? (
          <Field label={t("group.scheduleWeekday")} htmlFor={`${id}-weekday`} help={t("group.scheduleWeekdayHelp")}>
            <Select id={`${id}-weekday`} value={String(e.scheduleWeekday)} onChange={(ev) => e.setScheduleWeekday(Number(ev.target.value))}>
              {WEEKDAYS.map((d) => <option key={d} value={d}>{t(`weekday.${d}`)}</option>)}
            </Select>
          </Field>
        ) : null}
        {e.schedule !== "manual" ? (
          <Field label={t("group.scheduleHour")} htmlFor={`${id}-hour`} help={t("group.scheduleHourHelp")}>
            <Select id={`${id}-hour`} value={String(e.scheduleHour)} onChange={(ev) => e.setScheduleHour(Number(ev.target.value))}>
              {HOURS.map((h) => <option key={h} value={h}>{`${String(h).padStart(2, "0")}:00`}</option>)}
            </Select>
          </Field>
        ) : null}
      </div>
      <fieldset className="ox-field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="ox-label">{t("group.platforms")}</legend>
        <div className="ox-row" style={{ gap: 16 }}>
          {PLATFORM_LIST.map((p) => (
            <Checkbox key={p} checked={e.platforms.includes(p)} label={platformName(t, p)} onChange={(v) => e.setPlatforms((cur) => (v ? [...cur, p] : cur.filter((x) => x !== p)))} />
          ))}
        </div>
        {e.noPlatform ? <div className="ox-error" role="alert">{t("group.platformsRequired")}</div> : <div className="ox-help">{t("group.platformsHelp")}</div>}
      </fieldset>
    </>
  );
}
