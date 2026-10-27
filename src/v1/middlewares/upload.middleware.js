import path from "node:path";
import _ from "lodash";
import multer from "multer";
import {ApiError} from "../utils/ApiError.js";
import {MAX_UPLOAD_MB, UPLOAD_TYPES} from "../constants/application.constants.js";
import {MAX_LOGO_MB} from "../constants/settings.constants.js";
import zipHelper from "../helpers/zip.helper.js";

export const DOCX_TOO_LARGE = "This DOCX file is damaged, or too large once unpacked";

/**
 * Reads one file from the multipart field "file" into req.file (in memory, at most maxMb), when its
 * extension, MIME type and first bytes are one of types. Other multipart fields land in req.body as
 * text. Every problem with the file answers 422 on "file".
 */
const uploadOf = ({types, maxMb, wrongType}) => {
    const upload = multer({
        storage: multer.memoryStorage(),
        limits: {fileSize: maxMb * 1024 * 1024, files: 1},
        // File names with non-English characters arrive intact
        defParamCharset: "utf8",
        // Extension and MIME type first; the file's own first bytes are checked once it is read
        fileFilter: (req, file, done) => {
            const allowed = Boolean(types[path.extname(file.originalname).toLowerCase()]?.mimeTypes.includes(file.mimetype));
            done(allowed ? null : ApiError.validation({file: wrongType}), allowed);
        },
    });

    // A renamed file (e.g. an .exe called .pdf) does not start with the bytes of its claimed type
    const hasSignature = (file) => types[path.extname(file.originalname).toLowerCase()].signature.every((byte, index) => file.buffer[index] === byte);

    return (req, res, next) =>
        upload.single("file")(req, res, (error) => {
            if (error instanceof multer.MulterError) {
                const message = error.code === "LIMIT_FILE_SIZE" ? `The file must be at most ${maxMb} MB` : error.message;
                return next(ApiError.validation({file: message}));
            }
            if (error) return next(error);
            if (!req.file) return next(ApiError.validation({file: "Choose a file to upload"}));
            if (!hasSignature(req.file)) return next(ApiError.validation({file: wrongType}));
            // A DOCX is a ZIP: one that would unpack into gigabytes (a "zip bomb") is refused before anything reads it
            if (path.extname(req.file.originalname).toLowerCase() === ".docx" && !zipHelper.unpacksWithinLimits(req.file.buffer)) {
                return next(ApiError.validation({file: DOCX_TOO_LARGE}));
            }
            return next();
        });
};

/**
 * An application document: PDF, DOCX, JPG or PNG.
 *
 * @example router.post("/:id/documents", uploadFile, validate(schema), controller.upload)
 */
const uploadFile = uploadOf({types: UPLOAD_TYPES, maxMb: MAX_UPLOAD_MB, wrongType: "Upload a PDF, DOCX, JPG or PNG file"});

// The institution's logo for letters: PNG or JPG (what the PDF can draw)
export const uploadLogo = uploadOf({types: _.pick(UPLOAD_TYPES, [".png", ".jpg", ".jpeg"]), maxMb: MAX_LOGO_MB, wrongType: "Upload a PNG or JPG image"});

export default uploadFile;
