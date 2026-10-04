import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getPayPalSandboxReturnState: vi.fn() }));

vi.mock("../../src/server/paypal/return-status", () => ({ getPayPalSandboxReturnState: mocks.getPayPalSandboxReturnState }));

const { getPayPalSandboxReturnState } = mocks;

import PayPalSandboxSuccessPage from "../../src/app/paypal/sandbox/success/page";

describe("PayPal Sandbox success return page", () => {
  beforeEach(() => {
    getPayPalSandboxReturnState.mockReset();
  });

  it("shows retrieved provider state and completed capture status without using PayerID", async () => {
    getPayPalSandboxReturnState.mockResolvedValue({
      kind: "known_order",
      captureCompleted: true,
      order: {
        orderId: "5O190127TN364715T",
        providerStatus: "COMPLETED",
        capture: { status: "COMPLETED" },
      },
    });

    const page = await PayPalSandboxSuccessPage({
      searchParams: Promise.resolve({ token: "5O190127TN364715T", PayerID: "untrusted-payer-id" }),
    });
    const markup = renderToStaticMarkup(page);

    expect(getPayPalSandboxReturnState).toHaveBeenCalledWith("5O190127TN364715T");
    expect(markup).toContain("PAYPAL SANDBOX");
    expect(markup).toContain("PayPulse verification return");
    expect(markup).toContain("Sandbox Verification");
    expect(markup).toContain("Provider status");
    expect(markup).toContain("COMPLETED");
    expect(markup).toContain("VERIFIED");
    expect(markup).toContain("Back to PayPulse 3D Command Center");
    expect(markup).toContain("not real money");
    expect(markup).not.toContain("untrusted-payer-id");
  });

  it("makes an unknown return explicit and states that no lookup or capture occurred", async () => {
    getPayPalSandboxReturnState.mockResolvedValue({ kind: "unknown_order" });

    const page = await PayPalSandboxSuccessPage({ searchParams: Promise.resolve({ token: "5O190127TN364715T" }) });
    const markup = renderToStaticMarkup(page);

    expect(markup).toContain("Order is not known to PayPulse");
    expect(markup).toContain("No provider lookup or capture was attempted.");
    expect(markup).toContain("Sandbox payment — not real money.");
  });
});
