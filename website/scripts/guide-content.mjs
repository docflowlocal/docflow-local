export const guideKeys = [
  'guideBatchPdf',
  'guideMailMerge',
  'guideMapFields',
  'guideAssets',
  'guideValidation'
];

export const guideContent = {
  en: {
    guides: {
      path: '/guides/',
      title: 'Offline Document Automation Guides | DocFlow Local',
      description: 'Practical guides for generating Word and PDF documents from Excel, mapping template fields, validating records, and keeping sensitive files local.',
      name: 'Document automation guides',
      eyebrow: 'PRACTICAL GUIDES',
      h1: 'Build reliable document workflows from Excel, Word, and PDF',
      lead: 'Clear, testable guidance for teams that need to generate many documents without sending customer files to a cloud service.'
    },
    guideBatchPdf: {
      path: '/guides/batch-generate-pdf-from-excel/',
      title: 'How to Batch Generate PDFs from Excel Offline | DocFlow Local',
      description: 'A practical workflow for turning Excel or CSV rows into named PDF files locally, with template mapping, validation, and delivery packaging.',
      name: 'Batch-generate PDFs from Excel',
      eyebrow: 'EXCEL TO PDF',
      h1: 'How to batch-generate PDF files from Excel without uploading data',
      answer: 'Use one spreadsheet row as one generation record, map its columns to fields in an approved Word or PDF template, validate required values, and generate the files through a local desktop process. This produces a predictable PDF for every eligible row while the spreadsheet, templates, and outputs remain on the computer.',
      steps: [
        ['Prepare one record per row', 'Use a stable header row and include the identifiers needed for naming, validation, and template selection.'],
        ['Add the approved templates', 'Use DOCX placeholders or PDF AcroForm field names that represent the values to populate.'],
        ['Map columns to fields', 'Connect each template field to a spreadsheet column, literal value, computed rule, or conditional rule.'],
        ['Run preflight validation', 'Check required values, mapping decisions, template availability, and output naming before rendering.'],
        ['Generate and verify the package', 'Create the PDFs, validation report, and manifest; then verify file structure and checksums before delivery.']
      ],
      table: {
        headings: ['Spreadsheet column', 'Template field', 'Example'],
        rows: [
          ['Customer', '{{Customer Name}}', 'Northwind Trading'],
          ['QuoteNo', '{{Quote ID}}', 'Q-2026-0042'],
          ['Total', '{{Grand Total}}', '12,480.00'],
          ['OutputFolder', 'Folder rule', 'Northwind/Q-2026-0042']
        ]
      },
      facts: [
        'CSV, XLSX, and XLSM data can be read; spreadsheet macros are not executed.',
        'The current in-memory MVP accepts up to 2,000 output files and 1,000 locally rendered documents per job.',
        'Static PDFs without form fields can be copied, but arbitrary coordinate placement requires a visual PDF designer that is not part of the current MVP.'
      ],
      faq: [
        ['Does each Excel row create a separate PDF?', 'Yes. Each eligible row can generate one or more documents, depending on the templates selected for the workflow.'],
        ['Can the output use customer and quote numbers in file names?', 'Yes. File and folder patterns can use mapped fields, subject to filename safety and length checks.'],
        ['Are customer spreadsheets uploaded?', 'No. The desktop application reads the spreadsheet and templates locally and writes the generated delivery package locally.']
      ]
    },
    guideMailMerge: {
      path: '/guides/word-mail-merge-alternative/',
      title: 'Local Alternative to Word Mail Merge | DocFlow Local',
      description: 'Compare Word mail merge with a local multi-template document workflow that adds validation, naming rules, PDF forms, and delivery packaging.',
      name: 'Word mail merge alternative',
      eyebrow: 'WORKFLOW COMPARISON',
      h1: 'When a local document workflow is a better fit than Word mail merge',
      answer: 'Word mail merge is effective when one data source populates one Word document pattern. A document automation workflow becomes more useful when every record must create several coordinated files, apply conditional or computed fields, follow naming and folder rules, validate missing data, and produce a traceable delivery package.',
      steps: [
        ['Choose mail merge for a single letter pattern', 'It is familiar, built into Word, and suitable when the final workflow stays inside one document format.'],
        ['Choose a workflow for multi-file delivery', 'Use it when one record must create a quotation, appendix, form, and named customer folder together.'],
        ['Define validation before generation', 'Treat missing identifiers, dates, prices, and mapping decisions as explicit preflight issues.'],
        ['Keep an audit artifact', 'Include a manifest, validation report, and checksums so the delivered package can be inspected later.']
      ],
      table: {
        headings: ['Capability', 'Word mail merge', 'DocFlow Local workflow'],
        rows: [
          ['Primary output', 'Word document', 'Word, PDF, or combined package'],
          ['Multiple templates per record', 'Manual or separate runs', 'One configured generation job'],
          ['Missing-field preflight', 'Limited', 'Explicit validation before generation'],
          ['Naming and folder rules', 'Usually manual', 'Field-based patterns'],
          ['Local processing', 'Yes', 'Yes']
        ]
      },
      facts: [
        'DocFlow Local is not a replacement for document approval, electronic signature, or records-management systems.',
        'Complex DOCX layouts should be tested with representative templates because PDF conversion is not Microsoft Word itself.',
        'Conditional content and computed fields use a bounded expression evaluator rather than arbitrary JavaScript.'
      ],
      faq: [
        ['Should I replace every mail merge workflow?', 'No. Keep simple, reliable mail merge jobs. Change when validation, multiple templates, PDFs, packaging, or repeatable naming materially reduce manual work.'],
        ['Can existing Word templates be reused?', 'DOCX placeholders can be added to existing templates. Complex layouts, uncommon fonts, and advanced Word fields should be validated with sanitized copies first.'],
        ['Does the tool send documents to Microsoft 365?', 'No. The Community Edition performs its document workflow locally and does not require a Microsoft 365 upload.']
      ]
    },
    guideMapFields: {
      path: '/guides/map-excel-columns-to-word-template-fields/',
      title: 'Map Excel Columns to Word Template Fields | DocFlow Local',
      description: 'Learn how to map spreadsheet columns to DOCX placeholders, literal values, computed fields, and reusable document rules.',
      name: 'Map Excel columns to Word fields',
      eyebrow: 'FIELD MAPPING',
      h1: 'How to map Excel columns to Word template fields',
      answer: 'Give every business value a stable spreadsheet column and every destination a clear template placeholder. The column and placeholder names do not need to match exactly: create an explicit mapping once, review unresolved fields, and reuse the mapping for later batches that follow the same data contract.',
      steps: [
        ['Define a stable source header', 'Prefer durable business names such as CustomerName, QuoteID, Currency, and ValidUntil.'],
        ['Add DOCX placeholders', 'Use {{Field}} for text and mapped values, with separate markers for conditions, QR codes, images, and signatures.'],
        ['Resolve every detected field', 'Map it to a column or literal value, or explicitly ignore it so an accidental omission cannot pass silently.'],
        ['Add controlled rules', 'Use computed and conditional fields for approved arithmetic and controlled template variations.'],
        ['Test with representative records', 'Include normal, blank, long, multilingual, percentage, and leading-zero values in the validation set.']
      ],
      table: {
        headings: ['Purpose', 'Template syntax', 'Example source'],
        rows: [
          ['Mapped text', '{{Customer Name}}', 'CustomerName'],
          ['Conditional block', '{{#Show Discount}}…{{/Show Discount}}', 'Discount > 0'],
          ['QR code', '{{@qrcode:Quote ID}}', 'QuoteID'],
          ['Image', '{{@image:Photo}}', 'PhotoFile'],
          ['Signature image', '{{@signature}}', 'Uploaded local asset']
        ]
      },
      facts: [
        'Normal text placeholders may span multiple Word XML runs.',
        'Place conditional markers and image markers in their own paragraph or run for more predictable layout.',
        'Image assets are limited to validated PNG and JPEG files in the current MVP.'
      ],
      faq: [
        ['Must the Excel column name equal the Word placeholder?', 'No. The mapping layer can connect different names, which is useful when the spreadsheet follows an existing company data dictionary.'],
        ['How are blank numeric fields handled?', 'Blank values do not silently participate in arithmetic. Use an explicit fallback such as coalesce(field, 0) when zero is the approved business meaning.'],
        ['Can placeholders appear in headers and footers?', 'Yes. The template reader examines the document body, headers, footers, footnotes, and endnotes.']
      ]
    },
    guideAssets: {
      path: '/guides/insert-qr-signatures-images/',
      title: 'Insert QR Codes, Signatures and Images in Documents | DocFlow Local',
      description: 'Use explicit DOCX placeholders and PDF form field names to insert QR codes, PNG/JPEG images, and signature or stamp images locally.',
      name: 'Insert QR codes, signatures, and images',
      eyebrow: 'EMBEDDED ASSETS',
      h1: 'How to insert QR codes, signatures, and images into generated documents',
      answer: 'Use an explicit marker in DOCX or a named AcroForm field in PDF, then provide the image as a local PNG or JPEG asset. QR content can come from a mapped field. Signatures and stamps are inserted as images; they are not certificate-backed digital signatures.',
      steps: [
        ['Choose an explicit marker', 'Use {{@qrcode:Field}}, {{@image:Field}}, or {{@signature}} in DOCX.'],
        ['Name PDF form fields consistently', 'Use @qrcode:Field, @image:Field, signature, or stamp for the corresponding AcroForm field.'],
        ['Provide local assets', 'Upload only the images required for the batch and map them by field value, filename, or recognized signature name.'],
        ['Validate before generation', 'Reject unsupported formats, missing referenced assets, active PDF scripts, and unsafe document relationships.'],
        ['Review output meaning', 'Confirm that visual signatures, stamps, and codes meet the organization’s approval and legal requirements.']
      ],
      table: {
        headings: ['Asset', 'DOCX marker', 'PDF field name'],
        rows: [
          ['QR code', '{{@qrcode:Quote ID}}', '@qrcode:Quote ID'],
          ['Photo or logo', '{{@image:Photo}}', '@image:Photo'],
          ['Signature image', '{{@signature}}', 'signature'],
          ['Stamp image', '{{@signature}}', 'stamp']
        ]
      },
      facts: [
        'The current product accepts PNG and JPEG assets; SVG and active content are not accepted as embedded image inputs.',
        'A visual signature image does not provide cryptographic identity, certificate validation, or legal electronic-signature evidence.',
        'Generated QR codes should contain only the minimum information required for their operational purpose.'
      ],
      faq: [
        ['Can a different photo be selected for every row?', 'Yes. A mapped field can reference a local asset filename, allowing different records to use different validated images.'],
        ['Does inserting a signature create a legal digital signature?', 'No. It inserts an image. Legal and certificate-backed signing requires a separate approved signing process.'],
        ['Can PDF JavaScript be preserved?', 'Active PDF scripts are rejected during template import as part of the local template security policy.']
      ]
    },
    guideValidation: {
      path: '/guides/validate-missing-fields-before-generation/',
      title: 'Validate Missing Fields Before Document Generation | DocFlow Local',
      description: 'Design a preflight check for required fields, mapping decisions, naming rules, templates, assets, and generated delivery files.',
      name: 'Validate missing fields before generation',
      eyebrow: 'PREFLIGHT VALIDATION',
      h1: 'How to catch missing document fields before batch generation',
      answer: 'Run validation against the prepared record set before rendering any customer documents. Check required mapped values, rule errors, unresolved mappings, filename inputs, template resources, and expected local assets. Stop the batch or skip affected rows according to an explicit policy, then include the issues in the delivery report.',
      steps: [
        ['Identify business-required fields', 'Separate fields required for every record from fields that are optional only under documented conditions.'],
        ['Validate mappings and rules', 'Require every detected template field to be mapped or deliberately ignored, and surface expression errors by source row.'],
        ['Validate output paths', 'Check naming inputs, unsafe characters, duplicate paths, and bounded path lengths before packaging.'],
        ['Validate generated artifacts', 'Open generated PDFs and DOCX packages structurally and calculate sizes and SHA-256 checksums.'],
        ['Deliver the evidence', 'Include a validation report and JSON manifest with the output package.']
      ],
      table: {
        headings: ['Validation layer', 'Example failure', 'Expected action'],
        rows: [
          ['Source data', 'Quote ID is blank', 'Stop or skip the affected row'],
          ['Mapping', 'Template field unresolved', 'Map or explicitly ignore'],
          ['Rule', 'Blank value used in arithmetic', 'Add an approved fallback'],
          ['Asset', 'Referenced photo missing', 'Provide the local file'],
          ['Output', 'Duplicate normalized path', 'Create a unique safe path']
        ]
      },
      facts: [
        'CSV reports are protected against common spreadsheet-formula injection prefixes.',
        'The delivery manifest records input and output checksums for later integrity checks.',
        'Structural validation does not certify the business, legal, tax, or regulatory correctness of source data.'
      ],
      faq: [
        ['Can invalid rows be skipped while valid rows are generated?', 'Yes, when the workflow is configured to continue. Strict workflows can instead stop the batch when required data is missing.'],
        ['Does validation prove a quotation or contract is legally correct?', 'No. It checks the configured data and file rules. Authorized business or legal reviewers remain responsible for semantic correctness.'],
        ['What evidence is included in the output?', 'The package can include a CSV validation report and a JSON manifest containing generated files, sizes, checksums, source rows, warnings, and issues.']
      ]
    },
    benchmark: {
      path: '/benchmarks/local-batch-generation/',
      title: 'Reproducible Local Document Generation Benchmark | DocFlow Local',
      description: 'Review the DocFlow Local engine benchmark method, safety limits, test environment, and commands for reproducing batch packaging results.',
      name: 'Local generation benchmark',
      eyebrow: 'REPRODUCIBLE BENCHMARK',
      h1: 'A transparent benchmark for the local generation engine',
      answer: 'This benchmark measures validation, naming, PDF integrity checks, ZIP packaging, manifest creation, and checksum verification with a deterministic one-page PDF renderer. It does not claim to measure Microsoft Word rendering or Electron print-to-PDF speed, which vary with templates, fonts, operating systems, and page complexity.',
      steps: [
        ['Install the locked dependencies', 'Run npm ci with the supported Node.js version.'],
        ['Run the benchmark command', 'Use npm run benchmark:engine to execute the published 100, 500, and 1,000-record scenarios.'],
        ['Read the environment metadata', 'The command prints the application, Node.js, operating system, CPU, and memory information with every result.'],
        ['Interpret the scope correctly', 'Compare engine pipeline changes on similar hardware; do not treat the figures as an end-to-end promise for every Word or PDF template.']
      ],
      table: {
        headings: ['Records / PDFs', 'Median of 3 runs', 'Records per second'],
        rows: [
          ['100', '133 ms', '749.8'],
          ['500', '629 ms', '795.1'],
          ['1,000', '1,230 ms', '813.1']
        ]
      },
      facts: [
        'Reference run: DocFlow Local 0.4.0, Node.js 22.22.2, macOS arm64, Apple M5, 10 logical CPUs, 16 GiB memory, measured on 2026-07-28.',
        'The benchmark script and methodology are versioned with the source code; every scenario uses three measured runs after a warm-up.',
        'The in-memory MVP limits a job to 2,000 output files, 1,000 rendered documents, and 256 MB of uncompressed delivery content.',
        'Real DOCX-to-PDF and HTML-to-PDF rendering should be tested separately with representative templates on the target operating system.'
      ],
      faq: [
        ['Why use a deterministic PDF renderer?', 'It isolates the engine pipeline so validation, packaging, checksums, and regression changes can be compared without renderer variability.'],
        ['Is this an end-to-end production benchmark?', 'No. End-to-end results depend on the actual template renderer, fonts, pages, images, and hardware.'],
        ['Can I publish results from my own machine?', 'Yes. Include the command, DocFlow Local version, environment metadata, template scope, record count, and whether the result used the deterministic or desktop renderer.']
      ]
    }
  },
  zh: {
    guides: {
      path: '/zh/guides/',
      title: '本地文档自动化实用指南 | DocFlow Local',
      description: '学习从 Excel 批量生成 Word/PDF、映射模板字段、检查缺失数据，并让敏感文件始终留在本机。',
      name: '文档自动化指南',
      eyebrow: '实用指南',
      h1: '用 Excel、Word 和 PDF 建立可靠的批量文档工作流',
      lead: '面向贸易、工程、HR 和合规团队的可验证方法：批量生成文档，同时不把客户文件发送到云端。'
    },
    guideBatchPdf: {
      path: '/zh/guides/batch-generate-pdf-from-excel/',
      title: 'Excel 如何在本地批量生成 PDF | DocFlow Local',
      description: '把 Excel/CSV 每行数据映射到 Word/PDF 模板，在本机完成校验、自动命名、批量生成和交付打包。',
      name: 'Excel 批量生成 PDF',
      eyebrow: 'EXCEL 转 PDF',
      h1: '如何不上传数据，从 Excel 批量生成 PDF 文件',
      answer: '把表格中的每一行作为一条生成记录，将数据列映射到经过批准的 Word 或 PDF 模板字段，先检查必填值，再通过本地桌面程序生成文件。这样可以为每条有效记录生成可预测的 PDF，同时让表格、模板和输出始终留在电脑上。',
      steps: [
        ['每行只表示一条生成记录', '表头保持稳定，并包含命名、校验和模板选择所需的业务标识。'],
        ['添加经过批准的模板', 'DOCX 使用占位符，PDF 使用 AcroForm 字段名表示需要填入的内容。'],
        ['建立字段映射', '把模板字段连接到表格列、固定值、计算规则或条件规则。'],
        ['运行生成前校验', '在渲染前检查必填值、映射决策、模板状态和输出命名。'],
        ['生成并验证交付包', '生成 PDF、校验报告和清单，再检查文件结构及校验和。']
      ],
      table: {
        headings: ['Excel 数据列', '模板字段', '示例'],
        rows: [
          ['客户名称', '{{客户名称}}', '北方贸易有限公司'],
          ['报价编号', '{{报价编号}}', 'Q-2026-0042'],
          ['含税总额', '{{含税总额}}', '12,480.00'],
          ['输出目录', '目录规则', '北方贸易/Q-2026-0042']
        ]
      },
      facts: [
        '可以读取 CSV、XLSX 和 XLSM，但不会执行 Excel 宏。',
        '当前内存版 MVP 单次最多输出 2,000 个文件，并执行 1,000 份本地文档渲染。',
        '没有表单字段的静态 PDF 可以复制；任意坐标写入需要尚未包含在当前 MVP 中的 PDF 可视化设计器。'
      ],
      faq: [
        ['Excel 每一行都会生成一个 PDF 吗？', '每条有效记录可以生成一份或多份文件，数量取决于该工作流绑定的模板。'],
        ['文件名能使用客户名称和报价编号吗？', '可以。文件名和目录规则可以引用已映射字段，同时会接受安全字符和长度校验。'],
        ['客户表格会上传吗？', '不会。桌面客户端在本机读取表格和模板，并在本机写入交付包。']
      ]
    },
    guideMailMerge: {
      path: '/zh/guides/word-mail-merge-alternative/',
      title: 'Word 邮件合并的本地替代方案 | DocFlow Local',
      description: '比较 Word 邮件合并与本地多模板文档工作流，了解校验、自动命名、PDF 表单和交付打包的差异。',
      name: 'Word 邮件合并替代方案',
      eyebrow: '工作流对比',
      h1: '什么情况下本地文档工作流比 Word 邮件合并更合适',
      answer: '当一份数据源只需要填入一种 Word 文档时，邮件合并通常已经够用；当每条记录需要生成多份相互一致的文件、应用条件或计算字段、遵守命名和目录规则、检查缺失数据，并形成可追溯交付包时，完整的文档自动化工作流更合适。',
      steps: [
        ['单一信函优先使用邮件合并', '它内置于 Word，适合最终流程停留在一种文档格式中的场景。'],
        ['多文件交付使用组合工作流', '当一条记录需要同时生成报价单、附件、表单和客户目录时使用。'],
        ['生成前定义校验', '把缺失编号、日期、价格和未确认映射作为明确问题。'],
        ['保留交付证据', '在交付包中加入清单、校验报告和校验和，方便后续检查。']
      ],
      table: {
        headings: ['能力', 'Word 邮件合并', 'DocFlow Local 工作流'],
        rows: [
          ['主要输出', 'Word 文档', 'Word、PDF 或组合交付包'],
          ['每条记录多个模板', '手工或多次执行', '一次配置后组合生成'],
          ['缺失字段检查', '有限', '生成前明确校验'],
          ['文件名和目录规则', '通常手工处理', '字段化规则'],
          ['本地处理', '是', '是']
        ]
      },
      facts: [
        'DocFlow Local 不替代审批、电子签名或档案管理系统。',
        '复杂 DOCX 应使用真实代表模板测试，因为 PDF 转换并不是 Microsoft Word 本身。',
        '条件和计算字段使用受限表达式解析器，不执行任意 JavaScript。'
      ],
      faq: [
        ['是否应该替换所有邮件合并流程？', '不需要。简单且稳定的邮件合并可以继续使用；只有多模板、PDF、校验、打包或自动命名能明显减少手工工作时才值得迁移。'],
        ['能否继续使用现有 Word 模板？', '可以在现有 DOCX 中加入占位符。复杂版式、少见字体和高级 Word 域应先使用脱敏副本验证。'],
        ['工具会把文档发送到 Microsoft 365 吗？', '不会。社区版在本机完成文档工作流，不要求上传到 Microsoft 365。']
      ]
    },
    guideMapFields: {
      path: '/zh/guides/map-excel-columns-to-word-template-fields/',
      title: 'Excel 数据列如何映射到 Word 模板字段 | DocFlow Local',
      description: '把 Excel 列映射到 DOCX 占位符、固定值、计算字段和可复用规则，减少模板与数据命名不一致的问题。',
      name: 'Excel 映射 Word 模板字段',
      eyebrow: '字段映射',
      h1: '如何把 Excel 数据列映射到 Word 模板字段',
      answer: '先为每个业务数据建立稳定的 Excel 列，再为 Word 中的目标位置建立清晰占位符。两边名称不必完全相同：只要建立明确映射、处理所有未确认字段，并让后续批次遵守相同数据契约，就可以重复使用这套工作流。',
      steps: [
        ['定义稳定表头', '优先使用客户名称、报价编号、币种和有效期等长期业务名称。'],
        ['加入 DOCX 占位符', '普通内容使用 {{字段}}，条件、二维码、图片和签名单独使用对应标记。'],
        ['处理每一个识别字段', '映射到数据列或固定值，或者明确忽略，避免意外漏填。'],
        ['加入受控规则', '用计算和条件字段表达已经批准的公式及模板差异。'],
        ['使用代表性数据测试', '测试正常值、空值、长文本、中英文、百分比和前导零编号。']
      ],
      table: {
        headings: ['用途', '模板语法', '数据来源示例'],
        rows: [
          ['映射文本', '{{客户名称}}', '客户名称'],
          ['条件区块', '{{#显示优惠}}…{{/显示优惠}}', '优惠 > 0'],
          ['二维码', '{{@qrcode:报价编号}}', '报价编号'],
          ['图片', '{{@image:照片}}', '照片文件名'],
          ['签名图片', '{{@signature}}', '本地上传资源']
        ]
      },
      facts: [
        '普通文本占位符可以跨多个 Word XML run。',
        '条件标记和图片标记放在独立段落或 run 中，版式更可预测。',
        '当前 MVP 的图片资源限制为经过校验的 PNG 和 JPEG。'
      ],
      faq: [
        ['Excel 列名必须和 Word 占位符一样吗？', '不需要。映射层可以连接不同名称，适合继续沿用企业现有数据字典。'],
        ['空白数字字段怎么处理？', '空值不会静默参与运算；只有当业务含义确实是零时，才应使用 coalesce(字段, 0) 等明确默认值。'],
        ['页眉和页脚可以使用占位符吗？', '可以。模板读取器会检查正文、页眉、页脚、脚注和尾注。']
      ]
    },
    guideAssets: {
      path: '/zh/guides/insert-qr-signatures-images/',
      title: '批量文档中插入二维码、签名和图片 | DocFlow Local',
      description: '通过 DOCX 占位符和 PDF 表单字段，在本机插入二维码、PNG/JPEG 图片以及签名或印章图片。',
      name: '插入二维码、签名和图片',
      eyebrow: '图片资源',
      h1: '如何在批量生成的文档中插入二维码、签名和图片',
      answer: '在 DOCX 中使用明确占位符，或在 PDF 中建立命名规范的 AcroForm 字段，再提供本机 PNG/JPEG 图片。二维码内容可以来自映射字段。签名和印章只是图片，不属于基于证书的数字签名。',
      steps: [
        ['选择明确标记', 'DOCX 使用 {{@qrcode:字段}}、{{@image:字段}} 或 {{@signature}}。'],
        ['统一 PDF 字段命名', 'AcroForm 使用 @qrcode:字段、@image:字段、signature 或 stamp。'],
        ['提供本地图片资源', '只上传本批次需要的图片，并通过字段值、文件名或签名资源名匹配。'],
        ['生成前检查安全性', '拒绝不支持格式、缺失图片、PDF 活动脚本和不安全的文档外部关系。'],
        ['确认业务与法律含义', '检查签名、印章和二维码是否符合组织的审批及法律要求。']
      ],
      table: {
        headings: ['资源', 'DOCX 标记', 'PDF 字段名'],
        rows: [
          ['二维码', '{{@qrcode:报价编号}}', '@qrcode:报价编号'],
          ['照片或 Logo', '{{@image:照片}}', '@image:照片'],
          ['签名图片', '{{@signature}}', 'signature'],
          ['印章图片', '{{@signature}}', 'stamp']
        ]
      },
      facts: [
        '当前产品接受 PNG 和 JPEG；SVG 及活动内容不能作为嵌入图片输入。',
        '可视签名图片不提供密码学身份、证书验证或法律电子签证据。',
        '二维码只应包含实现业务用途所需的最少信息。'
      ],
      faq: [
        ['每条记录能使用不同照片吗？', '可以。映射字段可以引用本机图片文件名，让不同记录匹配不同的已校验图片。'],
        ['插入签名后就是法律数字签名吗？', '不是。这里只是插入图片；具备法律效力或证书支持的签署需要独立签名流程。'],
        ['PDF JavaScript 会被保留吗？', '不会。模板导入阶段会拒绝活动 PDF 脚本。']
      ]
    },
    guideValidation: {
      path: '/zh/guides/validate-missing-fields-before-generation/',
      title: '批量生成前如何校验缺失字段 | DocFlow Local',
      description: '在批量生成前检查必填字段、映射决策、命名规则、模板、图片资源和最终交付文件。',
      name: '生成前校验缺失字段',
      eyebrow: '生成前校验',
      h1: '如何在批量生成前发现缺失字段',
      answer: '在渲染客户文档之前，先对准备好的记录运行完整校验：检查必填映射值、规则错误、未处理映射、文件命名输入、模板资源和预期本地图片。根据明确策略停止整批或跳过问题行，并把所有问题写入校验报告。',
      steps: [
        ['识别业务必填字段', '区分每条记录都必须填写的字段，以及只有在明确条件下才可选的字段。'],
        ['校验映射和规则', '每个模板字段都必须映射或明确忽略；表达式错误应指向原始数据行。'],
        ['校验输出路径', '打包前检查命名输入、不安全字符、重复路径和路径长度。'],
        ['校验生成文件', '结构化打开生成的 PDF 和 DOCX，并计算大小和 SHA-256 校验和。'],
        ['交付校验证据', '把校验报告和 JSON 清单加入最终交付包。']
      ],
      table: {
        headings: ['校验层', '示例问题', '预期处理'],
        rows: [
          ['源数据', '报价编号为空', '停止或跳过问题行'],
          ['映射', '模板字段未处理', '映射或明确忽略'],
          ['规则', '空值直接参与运算', '加入经过批准的默认值'],
          ['图片', '引用照片不存在', '提供对应本地文件'],
          ['输出', '规范化路径重复', '生成安全且唯一的路径']
        ]
      },
      facts: [
        'CSV 报告会防止常见的电子表格公式注入前缀。',
        '交付清单记录输入与输出校验和，便于后续完整性检查。',
        '结构校验不会证明源数据在业务、法律、财税或监管意义上正确。'
      ],
      faq: [
        ['问题行能跳过，其他行继续生成吗？', '可以，前提是工作流配置为继续处理；严格流程也可以在发现必填值缺失时停止整批。'],
        ['校验能证明报价单或合同在法律上正确吗？', '不能。它只检查已配置的数据和文件规则；业务或法律正确性仍由授权审核人员负责。'],
        ['输出中会保留哪些校验证据？', '交付包可以包含 CSV 校验报告和 JSON 清单，记录文件、大小、校验和、来源行、警告和问题。']
      ]
    },
    benchmark: {
      path: '/zh/benchmarks/local-batch-generation/',
      title: '本地批量文档生成可复现性能测试 | DocFlow Local',
      description: '查看 DocFlow Local 引擎性能测试方法、安全边界、运行环境和100、500、1000条记录的复现命令。',
      name: '本地生成性能测试',
      eyebrow: '可复现性能测试',
      h1: '透明且可复现的本地生成引擎性能测试',
      answer: '该测试使用确定性单页 PDF 渲染器，测量数据校验、自动命名、PDF 完整性检查、ZIP 打包、清单生成和校验和验证。它不代表 Microsoft Word 渲染或 Electron 打印 PDF 的速度；这些结果会随模板、字体、系统和页面复杂度变化。',
      steps: [
        ['安装锁定依赖', '使用支持的 Node.js 版本运行 npm ci。'],
        ['执行测试命令', '运行 npm run benchmark:engine，依次测试100、500和1000条记录。'],
        ['读取环境信息', '命令会输出应用版本、Node.js、系统、CPU和内存信息。'],
        ['正确理解范围', '在相似硬件上比较引擎管线变化，不要把结果当作所有 Word/PDF 模板的端到端承诺。']
      ],
      table: {
        headings: ['记录数 / PDF数', '3次运行中位数', '每秒记录数'],
        rows: [
          ['100', '133毫秒', '749.8'],
          ['500', '629毫秒', '795.1'],
          ['1,000', '1,230毫秒', '813.1']
        ]
      },
      facts: [
        '参考测试环境：DocFlow Local 0.4.0、Node.js 22.22.2、macOS arm64、Apple M5、10个逻辑CPU、16 GiB内存，测试日期为2026-07-28。',
        '测试脚本和方法与源代码一起管理；预热后，每个场景执行3次并采用中位数。',
        '当前内存版MVP单次限制为2,000个输出文件、1,000份渲染文档和256MB未压缩交付内容。',
        '真实DOCX转PDF和HTML转PDF应使用目标系统上的代表模板单独测试。'
      ],
      faq: [
        ['为什么使用确定性 PDF 渲染器？', '这样可以隔离引擎管线，在不受渲染器波动影响的情况下比较校验、打包、校验和和回归变化。'],
        ['这是不是端到端生产性能测试？', '不是。真实结果还取决于模板渲染器、字体、页数、图片和硬件。'],
        ['可以发布自己电脑上的测试结果吗？', '可以，但需要同时说明命令、DocFlow Local版本、环境信息、模板范围、记录数量，以及使用的是确定性渲染器还是桌面渲染器。']
      ]
    }
  }
};
