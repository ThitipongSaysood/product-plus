import { cookies } from "next/headers";
import { LANG_COOKIE, makeT, toLocale, type Locale, type T } from "./index";

export async function getLocale(): Promise<Locale> {
  return toLocale((await cookies()).get(LANG_COOKIE)?.value);
}

export async function getT(): Promise<T> {
  return makeT(await getLocale());
}
