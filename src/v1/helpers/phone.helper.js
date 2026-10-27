// Country calling codes are 1 to 3 digits and none starts another (ITU E.164): 1 and 7 alone, these two-digit ones, else three
const TWO_DIGIT_CODES = new Set([
    "20", "27", "30", "31", "32", "33", "34", "36", "39", "40", "41", "43", "44", "45", "46", "47", "48", "49",
    "51", "52", "53", "54", "55", "56", "57", "58", "60", "61", "62", "63", "64", "65", "66", "81", "82", "84", "86",
    "90", "91", "92", "93", "94", "95", "98",
]);

const phoneHelper = {
    /**
     * A saved E.164 number as people read it, with the country code apart: "+919876543210" -> "+91 9876543210",
     * "+23415550100" -> "+234 15550100". For letters and emails; anything not in E.164 comes back as it is.
     */
    display: (phone) => {
        const digits = /^\+(\d{7,15})$/.exec(phone ?? "")?.[1];
        if (!digits) return phone ?? null;
        const codeLength = ["1", "7"].includes(digits[0]) ? 1 : TWO_DIGIT_CODES.has(digits.slice(0, 2)) ? 2 : 3;
        return `+${digits.slice(0, codeLength)} ${digits.slice(codeLength)}`;
    },
};

export default phoneHelper;
