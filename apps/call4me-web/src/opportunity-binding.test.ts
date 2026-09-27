import {
  boundOpportunityId,
  isOpportunityDialable,
  showDealIdField,
} from "./opportunity-binding";

const dealId = "22222222-2222-4222-8222-222222222222";

describe("opportunity binding", () => {
  it.each([
    { value: dealId, expected: dealId },
    { value: ` ${dealId} `, expected: dealId },
    { value: "", expected: undefined },
    { value: "   ", expected: undefined },
    { value: "not-a-deal", expected: undefined },
  ])("reads a valid deal id from $value", ({ value, expected }) => {
    expect(boundOpportunityId(value)).toBe(expected);
  });

  it.each([
    { id: "", allowUnbound: true, expected: true },
    { id: "not-a-deal", allowUnbound: true, expected: true },
    { id: dealId, allowUnbound: true, expected: true },
    { id: dealId, allowUnbound: false, expected: true },
    { id: "", allowUnbound: false, expected: false },
    { id: "not-a-deal", allowUnbound: false, expected: false },
  ])(
    "dialable=$expected when id=$id allowUnbound=$allowUnbound",
    ({ id, allowUnbound, expected }) => {
      expect(isOpportunityDialable(id, allowUnbound)).toBe(expected);
    },
  );

  it.each([
    { allowUnbound: true, embedded: false, expected: false },
    { allowUnbound: true, embedded: true, expected: false },
    { allowUnbound: false, embedded: true, expected: false },
    { allowUnbound: false, embedded: false, expected: true },
  ])(
    "shows Deal ID field=$expected when allowUnbound=$allowUnbound embedded=$embedded",
    ({ allowUnbound, embedded, expected }) => {
      expect(showDealIdField(allowUnbound, embedded)).toBe(expected);
    },
  );
});
