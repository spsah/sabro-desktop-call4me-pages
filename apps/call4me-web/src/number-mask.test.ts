import { describe, expect, it } from "vitest";
import { numberMaskLast4, number_mask_last4 } from "./number-mask";

describe("number_mask_last4 / numberMaskLast4", () => {
  it.each([
    {
      label: "E.164 UK mobile",
      input: "+447700900123",
      expected: "XXXXXXXX0123",
    },
    {
      label: "E.164 with spaces",
      input: "+44 7700 900123",
      expected: "XXXXXXXX0123",
    },
    {
      label: "national 07 spaced",
      input: "07700 900 123",
      expected: "XXXXXXX0123",
    },
    {
      label: "country code without plus",
      input: "447700900123",
      expected: "XXXXXXXX0123",
    },
    {
      label: "US E.164",
      input: "+12125550100",
      expected: "XXXXXXX0100",
    },
    {
      label: "formatted with dashes",
      input: "+44-7700-900123",
      expected: "XXXXXXXX0123",
    },
  ])("masks $label → $expected", ({ input, expected }) => {
    expect(numberMaskLast4(input)).toBe(expected);
    expect(number_mask_last4(input, true)).toBe(expected);
  });

  it.each([
    { label: "3-digit extension", input: "101" },
    { label: "4-digit extension", input: "2048" },
    { label: "3-digit with spaces", input: "1 0 1" },
  ])("never masks $label", ({ input }) => {
    expect(numberMaskLast4(input)).toBe(input);
    expect(numberMaskLast4(input, true)).toBe(input);
  });

  it("returns original when flag is explicitly false", () => {
    expect(numberMaskLast4("+447700900123", false)).toBe("+447700900123");
    expect(number_mask_last4("07700900123", false)).toBe("07700900123");
  });

  it("handles empty and short input safely", () => {
    expect(numberMaskLast4("")).toBe("");
    expect(numberMaskLast4("   ")).toBe("   ");
    expect(numberMaskLast4("12")).toBe("12");
    expect(numberMaskLast4("1")).toBe("1");
    expect(numberMaskLast4("+")).toBe("+");
    expect(numberMaskLast4("abcd")).toBe("abcd");
  });

  it("defaults to masking when flag omitted (MMPL ON)", () => {
    expect(numberMaskLast4("+447747448677")).toBe("XXXXXXXX8677");
  });
});
