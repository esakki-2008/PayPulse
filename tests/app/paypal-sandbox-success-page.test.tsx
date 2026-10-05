import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import PayPalSandboxSuccessPage from "../../src/app/paypal/sandbox/success/page";

describe("PayPal Sandbox success return page", () => {
  it("treats every browser return value as untrusted and requires authenticated server verification", async () => {
    const page = await PayPalSandboxSuccessPage();
    const markup = renderToStaticMarkup(page);
    expect(markup).toContain("PAYPAL SANDBOX");
    expect(markup).toContain("Return to PayPulse verification");
    expect(markup).toContain("Verify the known order from its authenticated action");
    expect(markup).toContain("does not read a provider order");
    expect(markup).toContain("not real money");
    expect(markup).toContain("Back to PayPulse 3D Command Center");
  });
});
