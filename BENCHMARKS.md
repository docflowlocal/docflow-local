# DocFlow Local benchmarks

This document publishes a reproducible benchmark for the local generation engine. It is intentionally narrower than an end-to-end desktop benchmark.

## What the benchmark measures

`npm run benchmark:engine` measures:

- record preparation and validation;
- field-based file and folder naming;
- PDF structure and page-count checks;
- ZIP package construction;
- validation-report and delivery-manifest creation;
- SHA-256 checksum generation and package re-verification.

The benchmark uses a deterministic one-page PDF renderer. It does **not** measure Microsoft Word, DOCX-to-PDF, or Electron HTML-to-PDF rendering. Those operations vary with fonts, images, page count, template complexity, operating system, and hardware.

## Reproduce the test

```bash
npm ci
npm run benchmark:engine
```

The command prints the DocFlow Local version, Node.js version, operating system, architecture, CPU, memory, three individual timings, their median, output size, and calculated records per second.

## Reference result

Measured on 2026-07-28 with DocFlow Local 0.4.0:

| Environment | Value |
| --- | --- |
| Node.js | 22.22.2 |
| Platform | macOS arm64 |
| CPU | Apple M5, 10 logical CPUs |
| Memory | 16 GiB |
| Repeats | 3 measured runs after warm-up |

| Records / PDFs | Median | Individual runs | Records per second | ZIP bytes |
| ---: | ---: | --- | ---: | ---: |
| 100 | 133 ms | 138 / 133 / 129 ms | 749.8 | 87,809 |
| 500 | 629 ms | 634 / 622 / 629 ms | 795.1 | 435,676 |
| 1,000 | 1,230 ms | 1,230 / 1,249 / 1,218 ms | 813.1 | 870,127 |

These figures describe only the deterministic engine pipeline defined above. They are not a promise for every Word or PDF template.

## Current safety boundaries

The in-memory MVP limits one job to:

- 2,000 generated output files;
- 1,000 locally rendered documents;
- 256 MB of uncompressed delivery content.

Jobs exceeding a boundary must be split. Real production acceptance tests should use sanitized copies of representative templates on the target Windows or macOS computers.

## Publishing comparable results

When sharing a result, include:

- DocFlow Local commit or release version;
- Node.js and operating-system versions;
- CPU, architecture, and memory;
- record and template counts;
- whether the deterministic renderer or a real desktop renderer was used;
- page count, fonts, images, and other relevant template characteristics;
- all individual timings, not only the fastest run.
