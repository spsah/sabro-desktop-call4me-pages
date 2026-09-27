import { describe, expect, it } from "vitest";
import brokerE164 from "../../../supabase/functions/_shared/e164.ts?raw";
import {
  formatKeypadDisplay,
  formatVertoDestination,
  normalizeDialDestination,
  rewriteVertoInviteDestination,
} from "./dial";
import clientE164 from "./e164.ts?raw";

describe("CR-CALL4ME-DIAL-E164-HOME-COUNTRY-001 egress normalize", () => {
  it.each([
    {
      row: 1,
      input: "+447747448677",
      home: "GB" as const,
      e164: "+447747448677",
    },
    {
      row: 2,
      input: "447747448677",
      home: "GB" as const,
      e164: "+447747448677",
    },
    {
      row: 3,
      input: "07747448677",
      home: "GB" as const,
      e164: "+447747448677",
    },
    {
      row: 4,
      input: "+44800800800",
      home: "GB" as const,
      e164: "+44800800800",
    },
    {
      row: 5,
      input: "44800800800",
      home: "GB" as const,
      e164: "+44800800800",
    },
    {
      row: 6,
      input: "0800800800",
      home: "GB" as const,
      e164: "+44800800800",
    },
    {
      row: 7,
      input: "0800800150",
      home: "GB" as const,
      e164: "+44800800150",
    },
    {
      row: 8,
      input: "+919876543210",
      home: "IN" as const,
      e164: "+919876543210",
    },
    {
      row: 9,
      input: "919876543210",
      home: "IN" as const,
      e164: "+919876543210",
    },
    {
      row: 10,
      input: "9876543210",
      home: "IN" as const,
      e164: "+919876543210",
    },
  ])(
    "row $row $input home=$home → $e164 before trunk",
    ({ input, home, e164 }) => {
      expect(normalizeDialDestination(input, home)).toBe(e164);
    },
  );

  it("row 11: IN trunk-prefix 0 is home NSN, not UK 07 (IN 0 + 10-digit mobile → +91)", () => {
    expect(normalizeDialDestination("07747448677", "IN")).not.toBe(
      "+447747448677",
    );
    expect(normalizeDialDestination("07747448677", "IN")).toBe("+917747448677");
  });

  it("row 12: keypad may show 07 after +44 paste; egress stays E.164", () => {
    expect(formatKeypadDisplay("+447747448677", "GB")).toBe("07747448677");
    expect(normalizeDialDestination("+447747448677", "GB")).toBe(
      "+447747448677",
    );
  });
});

describe("Call4Me keypad and contact dial share one E.164 path", () => {
  it.each([
    {
      label: "UK mobile E.164",
      contact: "+447747448677",
      keypad: "07747448677",
      dest: "+447747448677",
    },
    {
      label: "UK mobile 07 national",
      contact: "07747448677",
      keypad: "07747448677",
      dest: "+447747448677",
    },
    {
      label: "UK mobile intl without plus",
      contact: "447747448677",
      keypad: "07747448677",
      dest: "+447747448677",
    },
    {
      label: "UK mobile +44 with spaces",
      contact: "+44 747 448 6777",
      keypad: "07474486777",
      dest: "+447474486777",
    },
    {
      label: "UK mobile 00 international prefix",
      contact: "00447474486777",
      keypad: "07474486777",
      dest: "+447474486777",
    },
    {
      label: "BT 0800 test desk",
      contact: "+44800800800",
      keypad: "0800800800",
      dest: "+44800800800",
    },
    {
      label: "BT 0800 test alt",
      contact: "+44800800150",
      keypad: "0800800150",
      dest: "+44800800150",
    },
    {
      label: "BT 0800 intl without plus",
      contact: "44800800800",
      keypad: "0800800800",
      dest: "+44800800800",
    },
  ])(
    "$label: contact and keypad produce the same E.164 destination",
    ({ contact, keypad, dest }) => {
      expect(normalizeDialDestination(contact)).toBe(dest);
      expect(normalizeDialDestination(keypad)).toBe(dest);
      expect(normalizeDialDestination(contact)).toBe(
        normalizeDialDestination(keypad),
      );
      expect(normalizeDialDestination(dest)).toBe(dest);
    },
  );

  it("never treats tel: as a product path — it normalizes to E.164 egress", () => {
    expect(normalizeDialDestination("tel:+447747448677")).toBe("+447747448677");
    expect(normalizeDialDestination("tel:07474486777")).toBe("+447474486777");
    expect(normalizeDialDestination("tel:0800800800")).toBe("+44800800800");
  });

  it("restores a UK trunk 0 stripped by pad/number coercion so 07 matches +44 egress", () => {
    expect(normalizeDialDestination("7747448677")).toBe("+447747448677");
    expect(normalizeDialDestination(7747448677 as never)).toBe("+447747448677");
    expect(normalizeDialDestination("4407747448677")).toBe("+447747448677");
    expect(normalizeDialDestination("7747448677")).toBe(
      normalizeDialDestination("+447747448677"),
    );
  });

  it("does not emit national 0800 on the trunk path", () => {
    expect(normalizeDialDestination("0800800800")).toBe("+44800800800");
    expect(normalizeDialDestination("0800800150")).toBe("+44800800150");
    expect(normalizeDialDestination("800800800")).toBe("+44800800800");
    expect(normalizeDialDestination("800800150")).toBe("+44800800150");
    expect(normalizeDialDestination("+44800800800")).toBe("+44800800800");
    expect(normalizeDialDestination("0800800800")).not.toBe("0800800800");
    expect(normalizeDialDestination("0800800800")).not.toMatch(/^00/);
  });

  it("keeps short keypad extensions as dialled digits", () => {
    expect(normalizeDialDestination("123")).toBe("123");
    expect(normalizeDialDestination("077")).toBe("077");
  });
});

describe("Keypad display may stay home-national while egress is E.164", () => {
  it("GB home fills UK trunk 0 on the pad", () => {
    expect(formatKeypadDisplay("+447747448677", "GB")).toBe("07747448677");
    expect(formatKeypadDisplay("447747448677", "GB")).toBe("07747448677");
    expect(formatKeypadDisplay("07747448677", "GB")).toBe("07747448677");
    expect(formatKeypadDisplay("+44800800800", "GB")).toBe("0800800800");
    expect(formatKeypadDisplay("44800800800", "GB")).toBe("0800800800");
    expect(formatKeypadDisplay("0800800800", "GB")).toBe("0800800800");
  });

  it("IN home shows national mobile without inventing a UK 0", () => {
    expect(formatKeypadDisplay("+919876543210", "IN")).toBe("9876543210");
    expect(formatKeypadDisplay("9876543210", "IN")).toBe("9876543210");
    expect(formatKeypadDisplay("919876543210", "IN")).toBe("9876543210");
  });
});

describe("Verto/FS invite is dead if destination_number keeps +E.164", () => {
  it.each([
    { input: "+447747448677", fs: "07747448677" },
    { input: "447747448677", fs: "07747448677" },
    { input: "07747448677", fs: "07747448677" },
    { input: "+44800800800", fs: "0800800800" },
    { input: "0800800800", fs: "0800800800" },
  ])("UK $input → FS $fs (never +)", ({ input, fs }) => {
    expect(normalizeDialDestination(input, "GB")).toMatch(/^\+/);
    expect(formatVertoDestination(input, "GB")).toBe(fs);
    expect(formatVertoDestination(input, "GB")).not.toContain("+");
  });

  it("IN E.164 drops + for FS digits (no UK 0 invented)", () => {
    expect(formatVertoDestination("9876543210", "IN")).toBe("919876543210");
    expect(formatVertoDestination("+919876543210", "IN")).toBe("919876543210");
    expect(formatVertoDestination("+919876543210", "IN")).not.toContain("+");
  });
});

describe("Broker dial-plan is SoR for FS-safe Verto digits before trunk", () => {
  it("rewrites keypad national and +E.164 to the pre-#32 UK 0… invite", () => {
    for (const destination of [
      "07747448677",
      "447747448677",
      "+447747448677",
    ]) {
      const rewritten = rewriteVertoInviteDestination(
        {
          method: "verto.invite",
          params: {
            dialogParams: {
              destination_number: destination,
              remote_caller_id_number: destination,
            },
          },
        },
        "GB",
      );
      expect(rewritten.params.dialogParams).toMatchObject({
        destination_number: "07747448677",
        remote_caller_id_number: "07747448677",
      });
      expect(
        String(rewritten.params.dialogParams?.destination_number),
      ).not.toContain("+");
    }
  });

  it("rewrites UK 0800 three input forms to the same FS national digits", () => {
    for (const destination of ["+44800800800", "44800800800", "0800800800"]) {
      const rewritten = rewriteVertoInviteDestination(
        {
          method: "verto.invite",
          params: { dialogParams: { destination_number: destination } },
        },
        "GB",
      );
      expect(rewritten.params.dialogParams).toMatchObject({
        destination_number: "0800800800",
      });
    }
  });

  it("uses Identity home_country for IN national without CC, still no +", () => {
    const rewritten = rewriteVertoInviteDestination(
      {
        method: "verto.invite",
        params: { dialogParams: { destination_number: "9876543210" } },
      },
      "IN",
    );
    expect(rewritten.params.dialogParams).toMatchObject({
      destination_number: "919876543210",
    });
  });

  it("does not rewrite non-invite methods", () => {
    const bye = {
      method: "verto.bye",
      params: { dialogParams: { callID: "call-id" } },
    };
    expect(rewriteVertoInviteDestination(bye, "GB")).toEqual(bye);
  });

  it("keeps broker _shared e164 identical to the client module", () => {
    expect(brokerE164).toBe(clientE164);
  });
});
