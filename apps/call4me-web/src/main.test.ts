import source from "./main.tsx?raw";

describe("standalone Call4Me mount", () => {
  it("enables unbound calling for shelf and /index.html", () => {
    expect(source).toContain("<App allowUnboundOpportunity />");
  });
});
