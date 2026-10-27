import zlib from "node:zlib";

// What a DOCX (a ZIP) may hold once unpacked: a real one is a few MB, a "zip bomb" of 10 MB can unpack into gigabytes
const MAX_ENTRY_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_BYTES = 60 * 1024 * 1024;
const MAX_ENTRIES = 2000;

const SIGNATURES = {endOfDirectory: 0x06054b50, directoryEntry: 0x02014b50, localHeader: 0x04034b50};
const STORED = 0;
const DEFLATED = 8;

/**
 * Checks a ZIP (e.g. a DOCX) before a library unpacks it in memory. The sizes are measured by really
 * unpacking each file with a cap, not taken from the ZIP's own headers, which a crafted file can fake.
 */
const zipHelper = {
    /**
     * true when every file inside unpacks to at most MAX_ENTRY_BYTES, and all together to MAX_TOTAL_BYTES.
     * false for a damaged ZIP, or one we do not read (ZIP64, encrypted, other compression): a DOCX is none of those
     */
    unpacksWithinLimits: (buffer) => {
        try {
            const entries = zipHelper.entries(buffer);
            if (entries.length > MAX_ENTRIES) return false;
            let total = 0;
            for (const entry of entries) {
                total += zipHelper.unpackedSize(buffer, entry, Math.min(MAX_ENTRY_BYTES, MAX_TOTAL_BYTES - total));
            }
            return true;
        } catch {
            return false;
        }
    },

    // The central directory: {method, flags, compressedSize, localHeaderOffset} of every file
    entries: (buffer) => {
        const end = zipHelper.endOfDirectory(buffer);
        const count = buffer.readUInt16LE(end + 10);
        let offset = buffer.readUInt32LE(end + 16);
        if (count === 0xffff || offset === 0xffffffff) throw new Error("ZIP64 is not read");

        const entries = [];
        for (let index = 0; index < count; index++) {
            if (buffer.readUInt32LE(offset) !== SIGNATURES.directoryEntry) throw new Error("Damaged central directory");
            entries.push({
                flags: buffer.readUInt16LE(offset + 8),
                method: buffer.readUInt16LE(offset + 10),
                compressedSize: buffer.readUInt32LE(offset + 20),
                localHeaderOffset: buffer.readUInt32LE(offset + 42),
            });
            offset += 46 + buffer.readUInt16LE(offset + 28) + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32);
        }
        return entries;
    },

    // The "end of central directory" record: the last 22 bytes, unless a comment (at most 64 KB) follows it
    endOfDirectory: (buffer) => {
        for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 22 - 0xffff); offset--) {
            if (buffer.readUInt32LE(offset) === SIGNATURES.endOfDirectory) return offset;
        }
        throw new Error("Not a ZIP");
    },

    // The real unpacked size of one file; throws when it is over `limit`
    unpackedSize: (buffer, entry, limit) => {
        if (entry.flags & 1) throw new Error("Encrypted");
        const header = entry.localHeaderOffset;
        if (buffer.readUInt32LE(header) !== SIGNATURES.localHeader) throw new Error("Damaged local header");
        const start = header + 30 + buffer.readUInt16LE(header + 26) + buffer.readUInt16LE(header + 28);
        const data = buffer.subarray(start, start + entry.compressedSize);

        if (entry.method === STORED) {
            if (data.length > limit) throw new Error("Too large");
            return data.length;
        }
        if (entry.method !== DEFLATED) throw new Error("Unknown compression");
        // Stops (throws) as soon as the output passes the limit, so a bomb never fills the memory
        return zlib.inflateRawSync(data, {maxOutputLength: Math.max(limit, 1)}).length;
    },
};

export default zipHelper;
