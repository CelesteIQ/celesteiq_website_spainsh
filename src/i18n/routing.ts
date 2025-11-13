import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["es"],
  defaultLocale: "es",
  localePrefix: "never", // <- this is the important part
});
