import { config } from "../config";
import URI from "urijs";
// --- as we only import types here, no runtime code will be emitted.
// --- And papaparse will not be included by the main js bundle
import { Parser, ParseResult, ParseError, ParseMeta } from "papaparse";
import { ParsedDistribution } from "./record";

export type CsvFailureReason = "toobig" | "sizeunknown" | null;
export interface DataLoadingResult {
    parseResult?: ParseResult;
    failureReason?: CsvFailureReason;
}

type CsvUrlType = string;

type CsvSourceType = CsvUrlType | ParsedDistribution;

let Papa;

const getPapaParse = async () => {
    if (!Papa) {
        Papa = await import(/* webpackChunkName: "papa" */ "papaparse");
    }
    return Papa;
};

const retryLater: <T>(f: () => Promise<T>, delay?: number) => Promise<T> = (
    f,
    delay = 100
) => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            try {
                resolve(f());
            } catch (e) {
                reject(e);
            }
        }, delay);
    });
};

class CsvDataLoader {
    private url: CsvUrlType;
    private data: any[] = [];
    private errors: ParseError[] = [];
    private metaData: ParseMeta | null = null;
    private isLoading: boolean = false;

    /**
     * When download & parse process is aborted as result of user or client side event (e.g. component will be unmounted),
     * We set this marker and let loader know it should abort any unfinished processing.
     *
     * @private
     * @type {boolean}
     * @memberof CsvDataLoader
     */
    private toBeAborted: boolean = false;

    /**
     * Flag to skip handling the next call to `complete`.
     *
     * This is necessary because even if we call `parser.abort()`, the parser `onComplete` event will still be triggered,
     * causing the `complete` method to be called here.
     *
     * @private
     * @type {boolean}
     * @memberof CsvDataLoader
     */
    private skipComplete: boolean = false;

    constructor(source: CsvSourceType) {
        this.url = this.getSourceUrl(source);
    }

    private getSourceUrl(source: CsvSourceType): string {
        if (typeof source === "string") {
            return source;
        }
        if (source.downloadURL) {
            return source.downloadURL;
        }
        if (source.accessURL) {
            return source.accessURL;
        }
        throw new Error(
            `Failed to determine CSV data source url for distribution id: ${
                source.identifier
            }`
        );
    }

    private resetDownloadData() {
        this.data = [];
        this.errors = [];
        this.metaData = null;
        this.isLoading = false;
        this.toBeAborted = false;
        this.skipComplete = false;
    }

    abort() {
        if (!this.isLoading) return;
        this.toBeAborted = true;
    }

    convertToAbsoluteUrl(url) {
        if (url[0] !== "/") return url;
        return URI(location.href).origin() + url;
    }

    /**
     * Does a HEAD to get the length of the file at a URL
     */
    async getFileLength(url: string) {
        const res = await fetch(url, {
            method: "HEAD"
        });

        const contentLength = res.headers.get("content-length");
        if (contentLength !== null) {
            return Number(contentLength);
        }

        const contentRange = res.headers.get("content-range");
        if (contentRange !== null) {
            const split = contentRange.split("/");
            const length = split[1];

            if (length !== "*" && !Number.isNaN(Number.parseInt(length))) {
                return Number.parseInt(length);
            }
        }

        return null;
    }

    async load(overrideNewLine?: string): Promise<DataLoadingResult> {
        this.resetDownloadData();
        const proxyUrl =
            this.convertToAbsoluteUrl(config.proxyUrl) + "_0d/" + this.url;

        const fileLength = await this.getFileLength(proxyUrl);

        console.log(fileLength);

        let csvRes: Response;
        if (fileLength === null) {
            return { failureReason: "sizeunknown" };
        } else if (fileLength > config.csvLoaderChunkSize) {
            return { failureReason: "toobig" };
        } else {
            csvRes = await fetch(proxyUrl);
        }

        if (!csvRes.ok) {
            throw new Error("Could not retrieve csv: " + csvRes.statusText);
        }

        const Papa = await getPapaParse();
        return new Promise(async (resolve, reject) => {
            const options = {
                worker: true,
                header: true,
                // --- Papa Parser by default will decide whether to use `fastMode` by itself.
                // --- Disable it to avoid random issues
                fastMode: false,
                skipEmptyLines: true,
                newline: overrideNewLine,
                trimHeader: true,
                // --- the `bind` is required here even for arrow function under worker mode
                chunk: ((results: ParseResult, parser: Parser) => {
                    try {
                        if (this.toBeAborted) {
                            parser.abort();
                            reject(
                                new Error("Data processing has been aborted.")
                            );
                            return;
                        }
                        if (
                            results.errors.length >= 1 &&
                            !results.data.length
                        ) {
                            // --- there are many reason that an error could be triggered
                            // --- we only stop processing when no any row can be processed from this chunk
                            reject(new Error(results.errors[0].message));
                            // --- stop further process
                            parser.abort();
                            return;
                        }
                        if (
                            results.data.length <= 1 &&
                            results.errors.length >= 1 &&
                            overrideNewLine !== "\n"
                        ) {
                            // A lot of CSV GEO AUs have an issue where papa can't detect the newline - try again with it overridden
                            this.skipComplete = true;
                            parser.abort();
                            console.log(
                                "retry CSV parsing with the different line ending setting..."
                            );
                            // --- worker may not abort immediately, retry later to avoid troubles
                            resolve(retryLater(this.load.bind(this, "\n")));
                        } else {
                            this.data = this.data.concat(results.data);
                            this.errors = this.errors.concat(results.errors);
                            if (!this.metaData) {
                                this.metaData = results.meta;
                            }
                        }
                    } catch (e) {
                        console.error(e);
                        reject(e);
                    }
                }).bind(this),
                complete: (() => {
                    try {
                        if (this.skipComplete) {
                            this.skipComplete = false;
                            return;
                        }
                        const result = {
                            parseResult: {
                                data: this.data,
                                errors: this.errors,
                                meta: this.metaData as ParseMeta
                            }
                        };
                        this.resetDownloadData();
                        resolve(result);
                    } catch (e) {
                        reject(e);
                    }
                }).bind(this),
                error: err => {
                    reject(
                        err
                            ? err
                            : Error("Failed to retrieve or parse the file.")
                    );
                }
            };
            if (overrideNewLine) options["newline"] = overrideNewLine;
            Papa.parse(await csvRes.text(), options);
        });
    }
}

export default CsvDataLoader;
