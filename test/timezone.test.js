const { expect } = require("chai");
const { formatSlotDate, formatSlotTime } = require("../lib/helpers");

describe("calendar timezone formatting", () => {
  const septemberSlot = 1789732800000;
  const novemberSlot = 1793865600000;

  it("formats French slots in Europe/Paris with a 24-hour clock", () => {
    expect(formatSlotTime(septemberSlot, "fr")).to.equal("14:00");
    expect(formatSlotDate(septemberSlot, "fr")).to.equal(
      "vendredi 18 septembre 2026",
    );
  });

  it("keeps the canonical date when the host timezone differs", () => {
    expect(formatSlotTime(novemberSlot, "fr")).to.equal("09:00");
    expect(formatSlotDate(novemberSlot, "fr")).to.equal(
      "jeudi 5 novembre 2026",
    );
  });

  it("uses the English locale without changing the instant", () => {
    expect(formatSlotTime(septemberSlot, "en")).to.equal("2:00 PM");
    expect(formatSlotDate(septemberSlot, "en")).to.equal(
      "Friday, September 18, 2026",
    );
  });
});
