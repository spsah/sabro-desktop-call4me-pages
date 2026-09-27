import brokerSource from "../../../supabase/functions/call4me-broker/index.ts?raw";

describe("Call4Me broker origin contract", () => {
  it("accepts only explicitly configured SDK origins", () => {
    expect(brokerSource).toContain('Deno.env.get("CALL4ME_ORIGINS")');
    expect(brokerSource).toContain("CALL_ORIGINS.has(origin)");
    expect(brokerSource).not.toContain('"Access-Control-Allow-Origin": "*"');
  });
});
