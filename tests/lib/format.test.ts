import { describe, expect, it } from "vitest";

import { formatRelativeDate, formatTimestamp } from "../../src/lib/format";

describe("hydration-safe date formatting", () => {
  it("uses UTC formatting instead of the server or browser host locale", () => {
    const timestamp = "2026-10-04T20:52:56.000Z";

    expect(formatRelativeDate(timestamp)).toBe("Oct 4");
    expect(formatTimestamp(timestamp)).toBe("2026-10-04 20:52:56 UTC");
  });

  it("renders malformed timestamps safely and deterministically", () => {
    expect(formatRelativeDate("not-a-date")).toBe("Unavailable");
    expect(formatTimestamp("not-a-date")).toBe("Timestamp unavailable");
  });
});
