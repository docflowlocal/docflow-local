import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { guideContent, guideKeys } from './guide-content.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(here, '..');
const projectRoot = resolve(siteRoot, '..');
const dist = join(siteRoot, 'dist');
const siteUrl = 'https://docflowlocal.com';
const repoUrl = 'https://github.com/docflowlocal/docflow-local';
const gaMeasurementId = 'G-77MP7J9XFT';
const lastModified = '2026-07-29';
const indexNowKey = '62a1c4ddd5abb4809935e193aa22fd73';
const socialImageUrl = `${siteUrl}/assets/docflow-local-og.png`;
const betaEmail = {
  en: 'mailto:support@willgo.tech?subject=DocFlow%20Local%20Beta',
  zh: 'mailto:support@roboai.tech?subject=DocFlow%20Local%20Beta'
};
const contactEmail = {
  en: 'mailto:support@willgo.tech?subject=DocFlow%20Local',
  zh: 'mailto:support@roboai.tech?subject=DocFlow%20Local'
};

const locales = {
  en: {
    code: 'en', label: 'EN', switchLabel: '中文', prefix: '',
    skip: 'Skip to content', menu: 'Open navigation',
    nav: { product: 'Product', industries: 'Industries', guides: 'Guides', templates: 'Templates', pricing: 'Pricing', security: 'Security' },
    beta: 'Join beta', source: 'View source', download: 'Download',
    footerIntro: 'Privacy-first document automation for teams that work with sensitive files.',
    footer: {
      product: 'Product', company: 'Company', resources: 'Resources',
      pricing: 'Pricing', security: 'Security', templates: 'Templates', download: 'Download', batch: 'Excel to Word / PDF',
      guides: 'Guides', benchmark: 'Benchmarks',
      github: 'GitHub', roadmap: 'Roadmap', privacy: 'Privacy', contact: 'Contact',
      trade: 'Trade quotations', engineering: 'Engineering delivery', hr: 'HR onboarding', compliance: 'Compliance packages',
      legal: 'Modular Community packages are moving to MPL-2.0; legacy 0.x source remains AGPL-3.0. DocFlow Local is a trademark of its owner.',
      locality: 'Designed for local-first work.'
    }
  },
  zh: {
    code: 'zh-CN', label: '中', switchLabel: 'EN', prefix: '/zh',
    skip: '跳到正文', menu: '打开导航',
    nav: { product: '产品', industries: '行业方案', guides: '指南', templates: '模板', pricing: '价格', security: '安全' },
    beta: '申请内测', source: '查看源码', download: '下载',
    footerIntro: '为敏感文档而生的本地优先批量自动化工具。',
    footer: {
      product: '产品', company: '相关信息', resources: '行业方案',
      pricing: '价格', security: '安全', templates: '模板', download: '下载', batch: 'Excel 批量生成 Word / PDF',
      guides: '实用指南', benchmark: '性能测试',
      github: 'GitHub', roadmap: '路线图', privacy: '隐私说明', contact: '联系我们',
      trade: '贸易报价', engineering: '工程交付', hr: 'HR 入职', compliance: '合规文件包',
      legal: '模块化社区版将采用 MPL-2.0；历史 0.x 源码继续采用 AGPL-3.0。DocFlow Local 为其所有者商标。',
      locality: '为本地优先工作流而设计。'
    }
  }
};

const pages = {
  en: {
    home: {
      path: '/', title: 'Offline Excel to Word & PDF Automation | DocFlow Local',
      description: 'Batch-generate Word and PDF files from JSON, Excel, or CSV on Windows and macOS. Map fields, validate data, auto-name files, and keep every document local.'
    },
    pricing: { path: '/pricing/', title: 'Document Automation Software Pricing | DocFlow Local', description: 'Compare the planned open-source Community edition, Pro workflow features, industry template packs, and business implementation options.' },
    security: { path: '/security/', title: 'Offline Document Automation & Privacy | DocFlow Local', description: 'Learn how DocFlow Local processes Excel, Word, PDF, signatures, and customer data on your computer without uploading source files.' },
    templates: { path: '/templates/', title: 'Excel, Word & PDF Automation Templates | DocFlow Local', description: 'Explore document automation template packs for trade quotations, engineering handover, HR onboarding, compliance, education, and property.' },
    download: { path: '/download/', title: 'DocFlow Local Beta for Windows & macOS', description: 'Join the DocFlow Local desktop beta for Windows or macOS, or follow the open-source Community edition on GitHub.' },
    batch: { path: '/features/excel-to-word-pdf/', title: 'Batch Generate Word & PDF from Excel | DocFlow Local', description: 'Use Excel or CSV rows with Word and PDF templates to batch-generate named, validated document packages entirely on your computer.' },
    trade: { path: '/industries/trade-quotation/', title: 'Excel Quotation & Proforma Generator | DocFlow Local', description: 'Batch-generate quotations, proforma invoices, packing lists, and customer delivery folders from Excel without uploading customer data.' },
    engineering: { path: '/industries/engineering-delivery/', title: 'Engineering Handover Package Generator | DocFlow Local', description: 'Generate project transmittals, cover sheets, document registers, acceptance forms, and structured handover packages locally.' },
    hr: { path: '/industries/hr-onboarding/', title: 'Offline HR Onboarding Document Generator | DocFlow Local', description: 'Batch-generate employee contracts, forms, policy notices, and onboarding folders from a roster while personal data stays local.' },
    compliance: { path: '/industries/compliance-package/', title: 'Compliance Package Automation | DocFlow Local', description: 'Assemble traceable, validated compliance applications, declarations, evidence indexes, and delivery folders from approved templates.' }
  },
  zh: {
    home: { path: '/zh/', title: 'Excel批量生成Word/PDF｜本地文档自动化 - DocFlow Local', description: '导入 JSON、Excel 或 CSV，绑定 Word/PDF 模板，批量生成、自动命名并校验交付文件。Windows/macOS 本地运行，客户文件不上传。' },
    pricing: { path: '/zh/pricing/', title: '本地文档自动化软件价格 | DocFlow Local', description: '比较免费社区版、规划中的专业版功能、行业模板包与企业实施服务，按文档工作流价值选择方案。' },
    security: { path: '/zh/security/', title: '本地文档处理与数据安全 | DocFlow Local', description: '了解 DocFlow Local 如何在电脑本机处理 Excel、Word、PDF、签名和客户数据，不上传源文件。' },
    templates: { path: '/zh/templates/', title: 'Word/PDF 批量生成行业模板 | DocFlow Local', description: '查看贸易报价、工程交付、HR 入职、教育证书、合规认证和房产资料的文档自动化模板包。' },
    download: { path: '/zh/download/', title: '下载 DocFlow Local Windows/macOS 公测版', description: '申请 DocFlow Local Windows 或 macOS 桌面客户端公测，或在 GitHub 关注开源社区版。' },
    batch: { path: '/zh/features/excel-to-word-pdf/', title: 'Excel 批量生成 Word/PDF 文档 | DocFlow Local', description: '把 Excel/CSV 每行数据绑定到 Word 和 PDF 模板，在本机批量生成、命名、校验并整理文档包。' },
    trade: { path: '/zh/industries/trade-quotation/', title: 'Excel 批量生成报价单与形式发票 | DocFlow Local', description: '从 Excel 批量生成报价单、形式发票、装箱单和客户交付目录，客户数据无需上传。' },
    engineering: { path: '/zh/industries/engineering-delivery/', title: '工程资料与项目交付包自动化 | DocFlow Local', description: '在本地批量生成项目传递单、封面、文件清单、验收表与结构化竣工交付包。' },
    hr: { path: '/zh/industries/hr-onboarding/', title: 'HR 入职资料批量生成 | DocFlow Local', description: '从员工花名册批量生成合同、登记表、制度通知和入职目录，个人信息全程留在本机。' },
    compliance: { path: '/zh/industries/compliance-package/', title: '合规与认证文件包自动化 | DocFlow Local', description: '使用标准数据和批准模板，批量组装经过校验的申请表、声明、证据索引和交付目录。' }
  }
};

for (const locale of ['en', 'zh']) {
  for (const key of ['guides', ...guideKeys, 'benchmark']) {
    const content = guideContent[locale][key];
    pages[locale][key] = {
      path: content.path,
      title: content.title,
      description: content.description
    };
  }
}

const pageNames = {
  en: {
    home: 'Home',
    pricing: 'Pricing',
    security: 'Security & privacy',
    templates: 'Document automation templates',
    download: 'Download & beta',
    batch: 'Excel to Word & PDF',
    trade: 'Trade quotation automation',
    engineering: 'Engineering handover automation',
    hr: 'HR onboarding automation',
    compliance: 'Compliance package automation'
  },
  zh: {
    home: '首页',
    pricing: '价格方案',
    security: '安全与隐私',
    templates: '行业自动化模板',
    download: '下载与公测',
    batch: 'Excel 批量生成 Word/PDF',
    trade: '贸易报价自动化',
    engineering: '工程交付自动化',
    hr: 'HR 入职资料自动化',
    compliance: '合规文件包自动化'
  }
};

for (const locale of ['en', 'zh']) {
  for (const key of ['guides', ...guideKeys, 'benchmark']) {
    pageNames[locale][key] = guideContent[locale][key].name;
  }
}

const icon = (name) => {
  const icons = {
    arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v5c0 4.6-2.8 8-7 10-4.2-2-7-5.4-7-10V6l7-3zM9 12l2 2 4-5"/></svg>',
    table: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 4v16"/></svg>',
    file: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h8l4 4v16H6zM14 2v5h5M9 12h6M9 16h6"/></svg>',
    rules: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h10M18 6h2M4 12h3M11 12h9M4 18h8M16 18h4"/><circle cx="16" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="14" cy="18" r="2"/></svg>',
    qr: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM15 14h2v2h-2zM19 14h1v5h-3M13 19h2v1h-2z"/></svg>',
    folder: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h7l2 2h9v11H3z"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></svg>'
  };
  return icons[name] || icons.file;
};

const urlFor = (locale, key) => pages[locale][key].path;

function brand() {
  return '<span class="brand-mark" aria-hidden="true">D<i></i></span><span class="brand-copy"><strong>DocFlow Local</strong><small>LOCAL FIRST</small></span>';
}

function header(locale, current) {
  const l = locales[locale];
  const other = locale === 'en' ? 'zh' : 'en';
  const nav = [
    ['home', l.nav.product], ['home#industries', l.nav.industries], ['guides', l.nav.guides], ['templates', l.nav.templates],
    ['pricing', l.nav.pricing], ['security', l.nav.security]
  ];
  const navLinks = nav.map(([key, label]) => {
    const [pageKey, hash] = key.split('#');
    const href = `${urlFor(locale, pageKey)}${hash ? `#${hash}` : ''}`;
    const active = current === pageKey && !hash ? ' aria-current="page"' : '';
    return `<a href="${href}"${active}>${label}</a>`;
  }).join('');
  return `<a class="skip-link" href="#main">${l.skip}</a>
  <header class="site-header">
    <div class="container header-inner">
      <a class="brand" href="${urlFor(locale, 'home')}" aria-label="DocFlow Local">${brand()}</a>
      <nav class="main-nav" data-nav aria-label="${locale === 'zh' ? '主导航' : 'Main navigation'}">${navLinks}</nav>
      <div class="header-actions">
        <a class="language-link" href="${urlFor(other, current)}" hreflang="${locales[other].code}" aria-label="${l.switchLabel}">${l.switchLabel}</a>
        <a class="button secondary" href="${repoUrl}">${l.source}</a>
        <a class="button primary" href="${urlFor(locale, 'download')}">${l.beta} ${icon('arrow')}</a>
        <button class="menu-button" type="button" data-menu aria-expanded="false" aria-label="${l.menu}"><span></span></button>
      </div>
    </div>
  </header>`;
}

function footer(locale) {
  const l = locales[locale];
  const f = l.footer;
  return `<footer class="site-footer">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-intro"><a class="brand" href="${urlFor(locale, 'home')}">${brand()}</a><p>${l.footerIntro}</p></div>
        <div class="footer-column"><strong>${f.product}</strong><a href="${urlFor(locale, 'batch')}">${f.batch}</a><a href="${urlFor(locale, 'pricing')}">${f.pricing}</a><a href="${urlFor(locale, 'security')}">${f.security}</a><a href="${urlFor(locale, 'templates')}">${f.templates}</a><a href="${urlFor(locale, 'download')}">${f.download}</a></div>
        <div class="footer-column"><strong>${f.resources}</strong><a href="${urlFor(locale, 'guides')}">${f.guides}</a><a href="${urlFor(locale, 'benchmark')}">${f.benchmark}</a><a href="${urlFor(locale, 'trade')}">${f.trade}</a><a href="${urlFor(locale, 'engineering')}">${f.engineering}</a><a href="${urlFor(locale, 'hr')}">${f.hr}</a><a href="${urlFor(locale, 'compliance')}">${f.compliance}</a></div>
        <div class="footer-column"><strong>${f.company}</strong><a href="${repoUrl}">${f.github}</a><a href="${repoUrl}/blob/main/ROADMAP.md">${f.roadmap}</a><a href="${repoUrl}/blob/main/PRIVACY.md">${f.privacy}</a><a href="${contactEmail[locale]}">${f.contact}</a></div>
      </div>
      <div class="footer-bottom"><span>© <span data-year>2026</span> DocFlow Local. ${f.legal}</span><span>${f.locality}</span></div>
    </div>
  </footer>`;
}

const absoluteUrlFor = (locale, key) => `${siteUrl}${urlFor(locale, key)}`;

const escapeAttribute = (value) => value
  .replaceAll('&', '&amp;')
  .replaceAll('"', '&quot;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');

function breadcrumb(locale, current) {
  if (current === 'home') return '';
  return `<nav class="breadcrumbs" aria-label="${locale === 'zh' ? '面包屑导航' : 'Breadcrumb'}"><div class="container"><ol><li><a href="${urlFor(locale, 'home')}">${pageNames[locale].home}</a></li><li aria-current="page">${pageNames[locale][current]}</li></ol></div></nav>`;
}

function structuredData(locale, current, faq = [], article = false) {
  const meta = pages[locale][current];
  const canonical = absoluteUrlFor(locale, current);
  const language = locales[locale].code;
  const organizationId = `${siteUrl}/#organization`;
  const websiteId = `${siteUrl}/#website`;
  const softwareId = `${siteUrl}/#software`;
  const webpageId = `${canonical}#webpage`;
  const imageId = `${socialImageUrl}#image`;
  const graph = [
    {
      '@type': 'Organization',
      '@id': organizationId,
      name: 'DocFlow Local',
      url: `${siteUrl}/`,
      logo: {
        '@type': 'ImageObject',
        url: `${siteUrl}/assets/icon.png`,
        width: 1024,
        height: 1024
      },
      sameAs: [repoUrl]
    },
    {
      '@type': 'WebSite',
      '@id': websiteId,
      url: `${siteUrl}/`,
      name: 'DocFlow Local',
      alternateName: locale === 'zh' ? '本地文档批量自动化工具' : 'Offline document automation',
      publisher: { '@id': organizationId },
      inLanguage: ['en', 'zh-CN']
    },
    {
      '@type': 'SoftwareApplication',
      '@id': softwareId,
      name: 'DocFlow Local',
      applicationCategory: 'BusinessApplication',
      applicationSubCategory: 'Document automation',
      operatingSystem: 'Windows 10/11, macOS',
      url: `${siteUrl}/`,
      image: { '@id': imageId },
      description: pages[locale].home.description,
      inLanguage: language,
      publisher: { '@id': organizationId }
    },
    {
      '@type': 'ImageObject',
      '@id': imageId,
      url: socialImageUrl,
      contentUrl: socialImageUrl,
      width: 1200,
      height: 630
    }
  ];

  const webpageTypes = ['WebPage'];
  if (article) webpageTypes.push('TechArticle');
  if (faq.length) webpageTypes.push('FAQPage');
  const webpage = {
    '@type': webpageTypes.length === 1 ? webpageTypes[0] : webpageTypes,
    '@id': webpageId,
    url: canonical,
    name: meta.title,
    description: meta.description,
    isPartOf: { '@id': websiteId },
    about: { '@id': softwareId },
    primaryImageOfPage: { '@id': imageId },
    inLanguage: language,
    dateModified: lastModified
  };

  if (article) {
    webpage.headline = meta.title;
    webpage.datePublished = lastModified;
    webpage.author = { '@id': organizationId };
    webpage.publisher = { '@id': organizationId };
  }

  if (current !== 'home') {
    const breadcrumbId = `${canonical}#breadcrumb`;
    webpage.breadcrumb = { '@id': breadcrumbId };
    graph.push({
      '@type': 'BreadcrumbList',
      '@id': breadcrumbId,
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: pageNames[locale].home,
          item: absoluteUrlFor(locale, 'home')
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: pageNames[locale][current],
          item: canonical
        }
      ]
    });
  }

  if (faq.length) {
    webpage.mainEntity = faq.map(([question, answer]) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: answer
      }
    }));
  }

  graph.push(webpage);
  return `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replaceAll('<', '\\u003c')}</script>`;
}

function layout(locale, current, body, { faq = [], article = false } = {}) {
  const meta = pages[locale][current];
  const canonical = absoluteUrlFor(locale, current);
  const title = escapeAttribute(meta.title);
  const description = escapeAttribute(meta.description);
  const socialAlt = escapeAttribute(locale === 'zh'
    ? 'DocFlow Local 本地文档批量自动化工具'
    : 'DocFlow Local offline document automation');
  return `<!doctype html>
<html lang="${locales[locale].code}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
  <meta name="theme-color" content="#0a1b2a">
  <link rel="canonical" href="${canonical}">
  <link rel="alternate" hreflang="en" href="${siteUrl}${urlFor('en', current)}">
  <link rel="alternate" hreflang="zh-CN" href="${siteUrl}${urlFor('zh', current)}">
  <link rel="alternate" hreflang="x-default" href="${siteUrl}${urlFor('en', current)}">
  <link rel="icon" href="/assets/icon.png">
  <link rel="apple-touch-icon" href="/assets/icon.png">
  <link rel="manifest" href="/site.webmanifest">
  <link rel="stylesheet" href="/assets/styles.css">
  <script async src="https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}"></script>
  <script src="/assets/analytics.js"></script>
  <meta property="og:type" content="website"><meta property="og:site_name" content="DocFlow Local">
  <meta property="og:title" content="${title}"><meta property="og:description" content="${description}">
  <meta property="og:url" content="${canonical}"><meta property="og:locale" content="${locale === 'zh' ? 'zh_CN' : 'en_US'}">
  <meta property="og:locale:alternate" content="${locale === 'zh' ? 'en_US' : 'zh_CN'}">
  <meta property="og:image" content="${socialImageUrl}"><meta property="og:image:secure_url" content="${socialImageUrl}">
  <meta property="og:image:type" content="image/png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${socialAlt}">
  <meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${title}"><meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${socialImageUrl}"><meta name="twitter:image:alt" content="${socialAlt}">
  ${structuredData(locale, current, faq, article)}
</head>
<body>
  ${header(locale, current)}
  <main id="main">${breadcrumb(locale, current)}${body}</main>
  ${footer(locale)}
  <script src="/assets/site.js" defer></script>
</body>
</html>`;
}

function productMock(locale) {
  const zh = locale === 'zh';
  return `<div class="product-stage" aria-label="${zh ? 'DocFlow Local 产品界面示意' : 'DocFlow Local product interface illustration'}">
    <div class="product-window">
      <div class="window-bar"><i></i><i></i><i></i><span class="window-title">DOCFLOW LOCAL · ${zh ? '文档包工作台' : 'PACKAGE WORKSPACE'}</span></div>
      <div class="window-body">
        <aside class="mock-sidebar"><div class="mock-brand"><i></i>DocFlow</div><div class="mock-nav-item active">${zh ? '生成工作台' : 'Generate'}</div><div class="mock-nav-item">${zh ? '模板' : 'Templates'}</div><div class="mock-nav-item">${zh ? '校验' : 'Validation'}</div><div class="mock-safe">● ${zh ? '离线模式<br>文件留在本机' : 'Offline mode<br>Files stay local'}</div></aside>
        <div class="mock-main">
          <div class="mock-heading"><div><small>${zh ? '当前项目' : 'CURRENT PROJECT'}</small><strong>${zh ? '七月报价交付包' : 'July quotation package'}</strong></div><i class="mock-action"></i></div>
          <div class="mock-flow"><span class="done" data-step="✓">${zh ? '数据' : 'Data'}</span><span class="done" data-step="✓">${zh ? '模板' : 'Templates'}</span><span class="done" data-step="✓">${zh ? '映射' : 'Map'}</span><span data-step="4">${zh ? '校验' : 'Validate'}</span><span data-step="5">${zh ? '生成' : 'Generate'}</span></div>
          <div class="mock-grid"><div class="mock-stack"><div class="mock-panel"><div class="mock-panel-head"><div><span>${zh ? '数据源' : 'DATA SOURCE'}</span><b>${zh ? '订单清单.xlsx' : 'orders.xlsx'}</b></div></div><div class="mock-metrics"><span>${zh ? '记录' : 'ROWS'}<b>63</b></span><span>${zh ? '字段' : 'FIELDS'}<b>18</b></span><span>${zh ? '缺失' : 'MISSING'}<b>2</b></span></div></div><div class="mock-panel"><div class="mock-panel-head"><div><span>${zh ? '预览' : 'PREVIEW'}</span><b>${zh ? '批量记录' : 'Batch records'}</b></div></div><div class="mock-rows"><div class="mock-row"><b>DF-24071</b><span>Atlas Trading</span><span>$12,850</span><i></i></div><div class="mock-row"><b>DF-24072</b><span>Northstar</span><span>$8,420</span><i></i></div><div class="mock-row"><b>DF-24073</b><span>Meridian</span><span>$19,300</span><i></i></div></div></div></div><div class="mock-panel mock-settings"><div class="mock-panel-head"><div><span>${zh ? '输出规则' : 'OUTPUT RULES'}</span><b>${zh ? '文件命名' : 'File naming'}</b></div></div><div class="mock-field">{customer}_{document_no}</div><div class="mock-toggle-row">${zh ? '按客户分目录' : 'Folder per customer'}<i></i></div><div class="mock-toggle-row">${zh ? '生成前校验' : 'Preflight validation'}<i></i></div></div></div>
        </div>
      </div>
    </div>
    <div class="floating-card"><div class="score"><span class="score-ring">96</span><span class="score-copy"><small>${zh ? '生成准备度' : 'READY TO GENERATE'}</small><b>${zh ? '还有 2 项需要确认' : '2 items need review'}</b></span></div><ul class="float-list"><li>${zh ? '数据文件已加载' : 'Data loaded'}<i>✓</i></li><li>${zh ? '2 条记录缺少地址' : '2 missing addresses'}<i>!</i></li><li>${zh ? '字段映射已完成' : 'Fields mapped'}<i>✓</i></li></ul></div>
  </div>`;
}

function home(locale) {
  const zh = locale === 'zh';
  const t = zh ? {
    eye: '文件不离开本机', h1: '从结构化数据批量生成 Word/PDF，<span>客户文件无需上传。</span>',
    lead: '导入 JSON、Excel 或 CSV，绑定 Word/PDF 模板，按记录批量生成、自动命名、校验缺失字段并整理成交付包。全程本地运行。',
    trust: ['无需上传客户文件', 'Windows 与 macOS', '开源社区版'],
    trustTitle: '适合高频文档团队', trustItems: ['贸易报价', '工程交付', 'HR 入职', '认证合规'],
    featuresEye: '一个本地工作台', featuresTitle: '从数据到交付，不再反复复制粘贴', featuresLead: '把容易出错的重复劳动，变成可检查、可复用的标准流程。',
    features: [
      ['table','字段映射','识别表格列与模板字段，保存映射后可反复批量使用。'],
      ['rules','条件与计算','按条件显示段落，组合字段并计算金额、日期和编号。'],
      ['qr','二维码与图片','在文档中插入二维码、签名、印章、产品图等动态素材。'],
      ['folder','自动命名与目录','使用字段规则命名文件，并按客户、项目或批次建立目录。'],
      ['check','生成前校验','发现必填缺失、重复编号、模板未绑定等问题后再生成。'],
      ['file','多模板交付包','一条记录生成多份文档，并合并整理为可交付文件包。']
    ],
    workflowEye: '五步完成', workflowTitle: '让每次交付都有清晰路径', workflow: [['01','导入数据','JSON / Excel / CSV'],['02','添加模板','Word / PDF'],['03','绑定字段','可视化映射'],['04','运行校验','先发现问题'],['05','批量生成','整理并交付']],
    industriesEye: '为真实场景设计', industriesTitle: '先解决四类高频、刚需工作流', industriesLead: '每个行业页都从具体交付物出发，而不是堆砌泛用功能。',
    industries: [
      ['trade','贸易报价','报价单、形式发票、装箱单和客户目录一次生成。'],
      ['engineering','工程项目交付','传递单、图纸目录、验收资料和竣工包统一整理。'],
      ['hr','HR 入职资料','合同、登记表、告知书和员工目录批量完成。'],
      ['compliance','合规与认证','申请表、声明、证据清单和交付目录减少漏项。']
    ],
    privacyEye: '本地优先', privacyTitle: '敏感客户文档，不该成为云端副本', privacyLead: 'DocFlow Local 在你的电脑上读取数据、渲染文档并输出文件。我们的网站无需接触这些内容。',
    privacyPoints: ['桌面应用只绑定本机回环地址','处理中的原始文件保留在本地内存和本机目录','默认不收集文档内容或字段值','社区版源代码可审查'],
    openEye: 'Core 与社区版开源', openTitle: '开发引擎与桌面工作流都可检查、扩展和共同改进', openLead: '模块化 0.5 正在拆分 Core、CLI、本地 API、插件接口和 Desktop Community；完成源码来源与许可审查后，新模块计划采用 MPL-2.0，历史 0.x 源码继续使用 AGPL-3.0。Pro 聚焦多数据源关系、无人值守自动化、审计审批、商业连接器与支持。',
    pricingEye: '清晰升级', pricingTitle: '先用起来，再为高价值效率付费', faqEye: '常见问题', faqTitle: '购买前最常被问到的事',
    ctaTitle: '拿一套真实文件，完成第一次批量交付', ctaLead: '申请公测，或从 GitHub 查看社区版。'
  } : {
    eye: 'YOUR FILES NEVER LEAVE YOUR COMPUTER', h1: 'Batch-generate Word and PDF documents from structured data—<span>without uploading files.</span>',
    lead: 'Import JSON, Excel, or CSV data, bind Word/PDF template fields, create documents for every record, validate missing values, name files, and assemble the final package — entirely offline.',
    trust: ['No customer-file uploads', 'Windows & macOS', 'Open-source community edition'],
    trustTitle: 'Built for document-heavy teams', trustItems: ['Trade quotations', 'Engineering delivery', 'HR onboarding', 'Compliance'],
    featuresEye: 'One local workspace', featuresTitle: 'From structured data to delivery, without copy-paste', featuresLead: 'Turn repetitive, error-prone document work into a reusable process your team can inspect before delivery.',
    features: [
      ['table','Field mapping','Match spreadsheet columns to template fields and reuse the mapping across batches.'],
      ['rules','Conditions & calculations','Show content conditionally, combine fields, and calculate totals, dates, or identifiers.'],
      ['qr','QR codes & images','Insert QR codes, signatures, stamps, product photos, and other dynamic assets.'],
      ['folder','Naming & folders','Name files from record data and organize them by customer, project, or batch.'],
      ['check','Preflight validation','Catch required fields, duplicate IDs, and unbound template fields before generation.'],
      ['file','Multi-template packages','Generate several documents per record and organize them into a delivery-ready package.']
    ],
    workflowEye: 'Five clear steps', workflowTitle: 'Every delivery follows a visible path', workflow: [['01','Import data','JSON / Excel / CSV'],['02','Add templates','Word / PDF'],['03','Bind fields','Reusable mapping'],['04','Run preflight','Catch issues first'],['05','Generate','Package & deliver']],
    industriesEye: 'Designed around real work', industriesTitle: 'Starting with four frequent, high-value workflows', industriesLead: 'Each workflow begins with a concrete deliverable, not a generic list of features.',
    industries: [
      ['trade','Trade quotations','Generate quotations, proforma invoices, packing lists, and customer folders together.'],
      ['engineering','Engineering delivery','Standardize transmittals, drawing registers, acceptance records, and handover packs.'],
      ['hr','HR onboarding','Batch contracts, registration forms, notices, and employee folders locally.'],
      ['compliance','Compliance packages','Reduce omissions across applications, declarations, evidence lists, and final packages.']
    ],
    privacyEye: 'Local first', privacyTitle: 'Sensitive customer documents should not become cloud copies', privacyLead: 'DocFlow Local reads data, renders documents, and writes deliverables on your computer. Our website never needs the contents.',
    privacyPoints: ['Desktop service binds only to your loopback interface','Source files remain in local memory and local folders','No document contents or field values are collected by default','Community source is available for inspection'],
    openEye: 'Open-source Core and Community', openTitle: 'Inspect the engine and desktop workflow. Extend them with the community.', openLead: 'Modular 0.5 is separating Core, CLI, local API, plugin contracts, and Desktop Community. New modules are intended for MPL-2.0 after source-provenance and license review; legacy 0.x source remains AGPL-3.0. Pro focuses on relational data sources, unattended automation, audit and approval controls, commercial connectors, and support.',
    pricingEye: 'A clear upgrade path', pricingTitle: 'Start working, then pay for higher-value efficiency', faqEye: 'FAQ', faqTitle: 'What teams ask before getting started',
    ctaTitle: 'Bring one real file set. Complete your first batch.', ctaLead: 'Join the beta or inspect the community edition on GitHub.'
  };
  const featureCards = t.features.map(([ico,title,copy]) => `<article class="feature-card" data-reveal><span class="card-icon">${icon(ico)}</span><h3>${title}</h3><p>${copy}</p></article>`).join('');
  const workflow = t.workflow.map(([num,title,copy]) => `<div class="workflow-item" data-reveal><span class="workflow-number">${num}</span><h3>${title}</h3><p>${copy}</p></div>`).join('');
  const industryCards = t.industries.map(([key,title,copy], i) => `<article class="industry-card" data-number="0${i+1}" data-reveal><span class="tag">${zh ? '行业工作流' : 'Industry workflow'}</span><h3>${title}</h3><p>${copy}</p><a class="industry-link" href="${urlFor(locale,key)}">${zh ? '查看方案' : 'Explore workflow'} ${icon('arrow')}</a></article>`).join('');
  const body = `<section class="hero"><div class="container hero-grid"><div class="hero-copy"><p class="eyebrow">${t.eye}</p><h1>${t.h1}</h1><p>${t.lead}</p><div class="hero-actions"><a class="button primary" href="${urlFor(locale,'download')}">${locales[locale].beta} ${icon('arrow')}</a><a class="button secondary" href="${repoUrl}">${locales[locale].source}</a></div><div class="micro-trust">${t.trust.map(x=>`<span><i></i>${x}</span>`).join('')}</div></div>${productMock(locale)}</div></section>
  <div class="trust-bar"><div class="container trust-inner"><span>${t.trustTitle}</span>${t.trustItems.map((x,i)=>`<span class="trust-item"><i class="trust-icon">${icon(['table','folder','file','shield'][i])}</i>${x}</span>`).join('')}</div></div>
  <section class="section" id="product"><div class="container"><div class="section-heading"><p class="eyebrow">${t.featuresEye}</p><h2>${t.featuresTitle}</h2><p>${t.featuresLead}</p></div><div class="cards">${featureCards}</div><div class="hero-actions"><a class="button secondary" href="${urlFor(locale,'batch')}">${zh?'了解 Excel 批量生成 Word/PDF':'See the Excel-to-Word/PDF workflow'} ${icon('arrow')}</a></div></div></section>
  <section class="section alt"><div class="container"><div class="section-heading center"><p class="eyebrow">${t.workflowEye}</p><h2>${t.workflowTitle}</h2></div><div class="workflow-list">${workflow}</div></div></section>
  <section class="section" id="industries"><div class="container"><div class="section-heading"><p class="eyebrow">${t.industriesEye}</p><h2>${t.industriesTitle}</h2><p>${t.industriesLead}</p></div><div class="industry-grid">${industryCards}</div></div></section>
  <section class="section alt"><div class="container privacy-grid"><div class="privacy-diagram" data-reveal><span class="no-cloud">${zh ? '无文档云上传' : 'NO DOCUMENT CLOUD'}</span><div class="device-box"><div class="device-top"><i></i><span><b>${zh ? '你的电脑' : 'Your computer'}</b><small>${zh ? '本地处理边界' : 'LOCAL PROCESSING BOUNDARY'}</small></span></div><div class="device-flow"><span>JSON / Excel / CSV <i></i></span><span>Word / PDF <i></i></span><span>${zh ? '输出交付包' : 'Delivery package'} <i></i></span></div></div></div><div><p class="eyebrow">${t.privacyEye}</p><div class="section-heading"><h2>${t.privacyTitle}</h2><p>${t.privacyLead}</p></div><ul class="privacy-points">${t.privacyPoints.map(x=>`<li><i>✓</i><span>${x}</span></li>`).join('')}</ul><div class="hero-actions"><a class="button secondary" href="${urlFor(locale,'security')}">${zh ? '查看安全设计' : 'Read the security design'} ${icon('arrow')}</a></div></div></div></section>
  <section class="open-source-band"><div class="container open-grid"><div><p class="eyebrow">${t.openEye}</p><h2>${t.openTitle}</h2><p>${t.openLead}</p><div class="hero-actions"><a class="button primary" href="${repoUrl}">${locales[locale].source} ${icon('arrow')}</a><a class="button secondary" href="${repoUrl}/blob/main/ROADMAP.md">${zh ? '查看路线图' : 'Read the roadmap'}</a></div></div><div class="code-card"><div class="code-card-top"><span><i></i> docflow-local</span><span>COMMUNITY</span></div><pre><span class="accent">$</span> git clone ${repoUrl}.git
<span class="accent">$</span> cd docflow-local
<span class="accent">$</span> npm ci
<span class="accent">$</span> npm run desktop

✓ ${zh ? '数据在本机处理' : 'data processed locally'}
✓ ${zh ? '社区可审查源码' : 'source open for inspection'}</pre></div></div></section>
  ${pricingSection(locale)}
  ${faqSection(locale)}
  ${cta(locale,t.ctaTitle,t.ctaLead)}`;
  return layout(locale, 'home', body, { faq: faqItems(locale) });
}

function pricingSection(locale, full = false) {
  const zh = locale === 'zh';
  const plans = zh ? [
    ['社区版','$0','个人与本地批处理',['JSON / Excel / CSV 导入','Word / PDF 字段映射','基础条件、计算与多模板生成','命名、校验与本地处理'],repoUrl,'查看源码','secondary'],
    ['专业版','$299','高频报价与交付团队',['社区版全部能力','多数据源关系与复杂规则','监控目录、定时任务与失败重试','审计、审批与商业支持'],betaEmail[locale],'申请创始用户价','primary'],
    ['企业版','询价','需要团队治理与行业落地的组织',['专业版全部能力','团队模板库、权限与集中许可','行业模板、部署、培训与 SLA','商业连接器与定制集成'],contactEmail[locale],'联系销售','dark']
  ] : [
    ['Community','$0','For personal and local batch work',['JSON / Excel / CSV import','Word / PDF field mapping','Core conditions, calculations, and multi-template generation','Naming, validation, and local processing'],repoUrl,'View source','secondary'],
    ['Pro','$299','For frequent quotation and delivery teams',['Everything in Community','Relational data sources and complex rules','Watched folders, scheduling, and failure retry','Audit, approval controls, and commercial support'],betaEmail[locale],'Get founding price','primary'],
    ['Business','Let’s talk','For team governance and industry rollout',['Everything in Pro','Team template library, permissions, and centralized licensing','Industry packs, deployment, training, and SLA','Commercial connectors and custom integration'],contactEmail[locale],'Contact sales','dark']
  ];
  const cards = plans.map((p,i)=>`<article class="price-card${i===1?' featured':''}" data-reveal>${i===1?`<span class="popular">${zh?'推荐':'MOST POPULAR'}</span>`:''}<div class="plan-name">${p[0]}</div><div class="price">${p[1]}${i===1?`<small>/${zh?'年':'year'}</small>`:''}</div><p class="plan-copy">${p[2]}</p><ul class="plan-list">${p[3].map(x=>`<li><i>✓</i>${x}</li>`).join('')}</ul><a class="button ${p[6]}" href="${p[4]}">${p[5]}</a></article>`).join('');
  const heading = full ? '' : `<div class="section-heading center"><p class="eyebrow">${zh?'清晰升级':'A CLEAR UPGRADE PATH'}</p><h2>${zh?'先用起来，再为高价值效率付费':'Start working, then pay for higher-value efficiency'}</h2></div>`;
  return `<section class="section${full?'':' alt'}"><div class="container">${heading}<div class="pricing-grid">${cards}</div><p class="fine-print">${zh?'功能开放范围以各版本发布说明为准。创始用户专业版首年 $149；续费前会清楚展示当期价格。行业模板包预计 $99–299/套，实施服务 $2,000 起。':'Feature availability follows each release note. Founding customers: $149 for the first Pro year; the renewal price will be shown clearly before renewal. Industry packs are planned at $99–299, with implementation from $2,000.'}</p></div></section>`;
}

function faqItems(locale) {
  const zh = locale === 'zh';
  return zh ? [
    ['客户文件会上传吗？','不会。桌面端文档处理在本机完成；官网只承载产品信息与下载入口。'],
    ['社区版是真的可用，还是只是演示？','社区版不是限额试用：当前代码已覆盖 JSON/Excel/CSV 导入、模板映射、批量生成、命名、基础条件计算和校验。模块化 0.5 源码与安装包仍会在发布说明中逐项标注成熟度。'],
    ['Word 和 PDF 都支持吗？','MVP 以两类模板为目标。复杂 Word 原版式保真和可视化 PDF 坐标映射会持续增强，并在发布说明中明确成熟度。'],
    ['能否购买一次永久使用？','社区版可永久免费使用。专业版按年提供更新与支持；企业客户可沟通商业许可和长期维护方案。']
  ] : [
    ['Are customer files uploaded?','No. Desktop document processing runs on your computer. The website only hosts product information and release links.'],
    ['Is Community usable or just a demo?','Community is not a quota-limited trial: the current code covers JSON/Excel/CSV import, template mapping, batch generation, naming, core conditions and calculations, and validation. The modular 0.5 source and installers will state maturity per capability in release notes.'],
    ['Do Word and PDF both work?','The MVP targets both template types. Complex Word layout fidelity and visual PDF coordinate mapping will keep improving, with maturity stated clearly in release notes.'],
    ['Can I buy it once and keep using it?','Community remains free to use. Pro is annual because it includes ongoing updates and support; businesses can discuss commercial licensing and longer-term maintenance.']
  ];
}

function faqSection(locale, items = faqItems(locale), heading = '') {
  const zh = locale === 'zh';
  const title = heading || (zh ? '购买前最常被问到的事' : 'What teams ask before getting started');
  return `<section class="section"><div class="container"><div class="section-heading center"><p class="eyebrow">${zh?'常见问题':'FAQ'}</p><h2>${title}</h2></div><div class="faq">${items.map(([q,a])=>`<div class="faq-item"><button class="faq-button" type="button" data-faq-button aria-expanded="false"><span>${q}</span><i>+</i></button><div class="faq-answer"><p>${a}</p></div></div>`).join('')}</div></div></section>`;
}

function cta(locale, title, lead) {
  const zh = locale === 'zh';
  return `<section class="section"><div class="container"><div class="cta-panel"><div><h2>${title}</h2><p>${lead}</p></div><div class="cta-actions"><a class="button primary" href="${betaEmail[locale]}">${locales[locale].beta} ${icon('arrow')}</a><a class="button secondary" href="${repoUrl}">${zh?'GitHub 源码':'GitHub source'}</a></div></div></div></section>`;
}

function pageHero(locale, eye, title, lead, actions = true) {
  const zh = locale === 'zh';
  return `<section class="page-hero"><div class="container"><p class="eyebrow">${eye}</p><h1>${title}</h1><p>${lead}</p>${actions?`<div class="page-actions"><a class="button primary" href="${betaEmail[locale]}">${locales[locale].beta} ${icon('arrow')}</a><a class="button secondary" href="${repoUrl}">${zh?'查看社区版':'View Community'}</a></div>`:''}</div></section>`;
}

function pricingPage(locale) {
  const zh = locale === 'zh';
  const body = `${pageHero(locale,zh?'从开源到专业交付':'FROM OPEN SOURCE TO PROFESSIONAL DELIVERY',zh?'从免费开始，按工作流价值升级':'Start free. Upgrade when the workflow earns its place.',zh?'社区版提供真正可用的本地批处理；专业版和企业服务面向高频团队增加关系数据、无人值守自动化、审计审批、治理和落地支持。具体开放范围以发布说明为准。':'Community provides a genuinely useful local batch workflow. Pro and Business add relational data, unattended automation, audit and approval controls, governance, and rollout support for high-frequency teams. Availability follows the release notes.')}
  ${pricingSection(locale,true)}
  <section class="section alt"><div class="container"><div class="section-heading"><p class="eyebrow">${zh?'版本对比':'PLAN COMPARISON'}</p><h2>${zh?'核心能力一眼看清':'The capabilities that matter'}</h2></div><table class="comparison"><thead><tr><th>${zh?'能力':'Capability'}</th><th>${zh?'社区版':'Community'}</th><th>${zh?'专业版':'Pro'}</th><th>${zh?'企业版':'Business'}</th></tr></thead><tbody>${[
    [zh?'JSON / Excel / CSV 与基础映射':'JSON / Excel / CSV & core mapping','✓','✓','✓'],
    [zh?'批量生成、基础条件计算与校验':'Batch generation, core conditions & validation','✓','✓','✓'],
    [zh?'关系数据源与无人值守自动化':'Relational sources & unattended automation','—','✓','✓'],
    [zh?'任务历史、审计与审批控制':'Task history, audit & approval controls','—','✓','✓'],
    [zh?'商业连接器与优先支持':'Commercial connectors & priority support','—','✓','✓'],
    [zh?'团队权限、集中部署与 SLA':'Team permissions, managed deployment & SLA','—','—','✓']
  ].map(r=>`<tr><td>${r[0]}</td>${r.slice(1).map(v=>`<td class="${v==='✓'?'check':''}">${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>
  ${faqSection(locale)}${cta(locale,zh?'先用真实文件验证价值':'Validate the value with real files',zh?'申请创始用户资格，首年专业版计划价 $149。':'Apply as a founding user for a planned $149 first Pro year.')}`;
  return layout(locale,'pricing',body,{ faq: faqItems(locale) });
}

function securityPage(locale) {
  const zh = locale === 'zh';
  const cards = zh ? [
    ['本机处理边界','桌面应用仅通过本机回环地址连接内置服务，默认不监听局域网。',['源数据不上传','输出写入用户选择的本机目录','网站与桌面处理隔离']],
    ['最小化数据保留','处理中间数据优先保存在内存；临时文件和日志不应记录原始字段值。',['不收集文档正文','不以客户文件训练模型','遥测保持关闭，除非将来明确征得同意']],
    ['桌面安全基线','Electron 窗口启用上下文隔离和沙箱，并限制网页代码可调用的本机能力。',['contextIsolation','sandbox','窄化 IPC 接口']],
    ['可审查与可报告','社区版代码公开；安全问题通过私密渠道报告，在修复前不公开细节。',['公开安全说明','负责任披露流程','版本说明列出安全修复']]
  ] : [
    ['Local processing boundary','The desktop app connects to its embedded service through the loopback interface and does not listen on the LAN by default.',['No source-data upload','Output goes to a local folder you choose','Website and desktop processing stay separate']],
    ['Minimized retention','Intermediate data is kept in memory where practical; temporary files and logs should not contain raw field values.',['No document-body collection','No training on customer files','Telemetry stays off unless explicitly introduced with consent']],
    ['Desktop security baseline','Electron windows use context isolation and sandboxing, with a narrow bridge to native capabilities.',['contextIsolation','sandbox','Narrow IPC surface']],
    ['Inspectable and reportable','Community code is open for review. Security reports use a private channel until a fix is ready.',['Published security policy','Responsible disclosure','Security fixes in release notes']]
  ];
  const body = `${pageHero(locale,zh?'安全不是口号':'SECURITY BY BOUNDARY',zh?'客户文档留在客户电脑上':'Customer documents stay on the customer’s computer',zh?'DocFlow Local 的核心设计选择，是尽量不让敏感数据产生新的云端副本。':'DocFlow Local is designed to avoid creating new cloud copies of sensitive customer data.')}
  <section class="section"><div class="container"><div class="section-heading"><p class="eyebrow">${zh?'四层保护':'FOUR PROTECTION LAYERS'}</p><h2>${zh?'从处理边界到安全披露':'From processing boundaries to responsible disclosure'}</h2></div><div class="detail-grid">${cards.map(([h,p,list])=>`<article class="detail-card" data-reveal><span class="card-icon">${icon('shield')}</span><h3>${h}</h3><p>${p}</p><ul>${list.map(x=>`<li>${x}</li>`).join('')}</ul></article>`).join('')}</div></div></section>
  <section class="section alt"><div class="container privacy-grid"><div><p class="eyebrow">${zh?'信任边界':'TRUST BOUNDARY'}</p><div class="section-heading"><h2>${zh?'官网、更新服务与文档处理彼此分开':'Website, updates, and document processing are separate'}</h2><p>${zh?'访问官网或检查版本不需要上传业务文件。将来若引入崩溃报告或可选遥测，会先公开字段、目的和关闭方式。':'Visiting the website or checking a version never requires business files. If crash reports or optional telemetry are introduced later, fields, purpose, and opt-out controls will be documented first.'}</p></div></div><div class="privacy-diagram"><span class="no-cloud">${zh?'数据不出机':'DATA STAYS LOCAL'}</span><div class="device-box"><div class="device-top"><i></i><span><b>DocFlow Local</b><small>127.0.0.1</small></span></div><div class="device-flow"><span>${zh?'表格数据':'Spreadsheet data'}<i></i></span><span>${zh?'模板渲染':'Template rendering'}<i></i></span><span>${zh?'交付文件':'Deliverables'}<i></i></span></div></div></div></div></section>
  ${cta(locale,zh?'需要企业安全评估材料？':'Need material for a security review?',zh?'联系我们获取部署说明、数据流说明与商业支持方案。':'Contact us for deployment notes, data-flow documentation, and commercial support options.')}`;
  return layout(locale,'security',body);
}

function templatesPage(locale) {
  const zh = locale === 'zh';
  const packs = zh ? [
    ['贸易报价基础包','报价单、形式发票、装箱单','Excel + Word / PDF','$99 起'],['工程交付基础包','传递单、文件目录、交付封面','Excel + Word / PDF','$149 起'],['HR 入职基础包','合同、登记表、告知书','Excel + Word','$99 起'],['合规文件包','申请表、声明、证据目录','Excel + Word / PDF','$199 起'],['学校证书包','证书、名单、成绩通知','Excel + Word / PDF','$99 起'],['房产挂牌资料包','房源单、合同附件、图册目录','Excel + Word / PDF','$149 起']
  ] : [
    ['Trade quotation starter','Quotation, proforma invoice, packing list','Excel + Word / PDF','From $99'],['Engineering handover starter','Transmittal, register, delivery cover','Excel + Word / PDF','From $149'],['HR onboarding starter','Contract, registration, notices','Excel + Word','From $99'],['Compliance package','Applications, declarations, evidence index','Excel + Word / PDF','From $199'],['School certificate pack','Certificates, rosters, result notices','Excel + Word / PDF','From $99'],['Property listing pack','Listing sheets, annexes, media index','Excel + Word / PDF','From $149']
  ];
  const body = `${pageHero(locale,zh?'可用的行业起点':'PRACTICAL INDUSTRY STARTERS',zh?'模板不是一张空白表，而是一套可复用交付流程':'Templates should be reusable delivery workflows, not blank files',zh?'每套行业模板包括示例数据、字段说明、命名规则、校验规则和交付目录建议。':'Each pack is planned to include sample data, a field dictionary, naming rules, validation rules, and a recommended delivery structure.')}
  <section class="section"><div class="container"><div class="section-heading"><p class="eyebrow">${zh?'计划中的模板包':'PLANNED TEMPLATE PACKS'}</p><h2>${zh?'从示例数据到交付目录的完整起点':'A complete starting point from sample data to delivery folders'}</h2></div><div class="template-grid">${packs.map((p,i)=>`<article class="template-card" data-reveal><div class="template-thumb"><span>PACK 0${i+1}</span></div><h3>${p[0]}</h3><p>${p[1]}</p><div class="template-meta"><span>${p[2]}</span><strong>${p[3]}</strong></div></article>`).join('')}</div><p class="fine-print">${zh?'模板包仍在公测准备阶段。最终内容、兼容性与价格以发布页为准。':'Template packs are being prepared for beta. Final contents, compatibility, and pricing will be stated on each release page.'}</p></div></section>
  ${cta(locale,zh?'有一套已经在使用的行业文件？':'Already have an industry file set?',zh?'我们可以把它整理成可重复执行的 DocFlow 工作流。':'We can turn it into a repeatable DocFlow workflow.')}`;
  return layout(locale,'templates',body);
}

function downloadPage(locale) {
  const zh = locale === 'zh';
  const body = `${pageHero(locale,zh?'公开测试准备中':'PUBLIC BETA IN PREPARATION',zh?'选择适合你的开始方式':'Choose how you want to get started',zh?'社区版源代码将通过 GitHub 发布；经过签名和公证的 Windows/macOS 安装包将在公测页提供。':'Community source will be published on GitHub. Signed and notarized Windows/macOS installers will follow on the beta page.',false)}
  <section class="section"><div class="container"><div class="download-grid"><article class="download-card"><span class="os-icon">⌘</span><h2>macOS</h2><p>${zh?'面向 Apple Silicon 的签名安装包正在准备，Intel 兼容性将根据公测反馈确认。':'A signed Apple Silicon installer is being prepared. Intel support will be confirmed from beta demand.'}</p><a class="button primary" href="${betaEmail[locale]}">${zh?'加入 macOS 公测':'Join macOS beta'} ${icon('arrow')}</a></article><article class="download-card"><span class="os-icon">⊞</span><h2>Windows</h2><p>${zh?'Windows 10/11 安装包正在适配与签名流程中。':'The Windows 10/11 build is going through packaging and signing preparation.'}</p><a class="button primary" href="${betaEmail[locale]}">${zh?'加入 Windows 公测':'Join Windows beta'} ${icon('arrow')}</a></article></div><div class="download-note"><strong>${zh?'为什么暂不直接放未签名安装包？':'Why not publish an unsigned installer now?'}</strong><br>${zh?'文档工具会接触敏感业务文件，安装包来源与完整性同样重要。正式公测包会附版本号、校验值、签名状态和清晰的发布说明。':'A document tool touches sensitive business files, so installer provenance matters. Public beta builds will include a version, checksum, signing status, and clear release notes.'}</div></div></section>
  <section class="section alt"><div class="container"><div class="section-heading"><p class="eyebrow">${zh?'开发者入口':'FOR DEVELOPERS'}</p><h2>${zh?'从社区版源代码开始':'Start from the community source'}</h2><p>${zh?'模块化 0.5 源码发布后，可按 README 运行桌面端，也可直接使用 Core 的 CLI、本地 API 与插件接口。':'When the modular 0.5 source is published, follow the README to run Desktop Community or use the Core CLI, local API, and plugin contracts directly.'}</p></div><div class="code-card"><div class="code-card-top"><span><i></i> docflow-local</span><span>COMMUNITY</span></div><pre><span class="accent">$</span> git clone ${repoUrl}.git
<span class="accent">$</span> cd docflow-local
<span class="accent">$</span> npm ci
<span class="accent">$</span> npm run desktop</pre></div></div></section>`;
  return layout(locale,'download',body);
}

function batchFaqItems(locale) {
  return locale === 'zh' ? [
    ['Excel 每一行都能生成一份文档吗？','可以把每行记录作为一条生成任务，并根据已绑定模板输出一份或多份文件。生成前可先预览记录和检查必填字段。'],
    ['可以直接使用现有 Word 和 PDF 模板吗？','MVP 面向已有 Word/PDF 模板。复杂 Word 原版式保真和可视化 PDF 坐标映射仍在持续增强，建议先用脱敏副本验证自己的模板。'],
    ['它和 Word 邮件合并有什么区别？','传统邮件合并主要生成单一文档。DocFlow Local 的目标是把多模板组合、条件内容、命名规则、缺失字段校验和目录结构放进同一个本地流程。'],
    ['表格、模板和生成文件会上传吗？','不会。桌面端处理在本机完成；官网只提供产品信息和公测入口，不需要接触客户文档内容。']
  ] : [
    ['Can each Excel row create a separate document?','Yes. Each row can act as one generation record and produce one or more files from the templates you bind. You can preview records and check required fields before generation.'],
    ['Can I use existing Word and PDF templates?','The MVP is designed around existing Word and PDF templates. Complex Word layout fidelity and visual PDF coordinate mapping are still improving, so validate sanitized copies of your own templates first.'],
    ['How is this different from Word mail merge?','Traditional mail merge usually focuses on one document. DocFlow Local is designed to combine multiple templates, conditional content, file naming, missing-field checks, and folder structure in one local workflow.'],
    ['Are spreadsheets, templates, or generated files uploaded?','No. Desktop processing runs on your computer. The website only provides product information and beta access and does not need the contents of customer documents.']
  ];
}

function batchPage(locale) {
  const zh = locale === 'zh';
  const fields = zh ? [
    ['客户名称','{customer_name}','海岳贸易有限公司'],
    ['报价编号','{quotation_no}','QT-2026-0727'],
    ['报价日期','{quote_date}','2026-07-27'],
    ['币种与金额','{currency} {total}','USD 12,850'],
    ['签名图片','{signature_image}','signatures/sales.png']
  ] : [
    ['Customer name','{customer_name}','Atlas Trading Ltd.'],
    ['Quotation number','{quotation_no}','QT-2026-0727'],
    ['Quotation date','{quote_date}','2026-07-27'],
    ['Currency and total','{currency} {total}','USD 12,850'],
    ['Signature image','{signature_image}','signatures/sales.png']
  ];
  const steps = zh ? [
    ['01','导入 Excel / CSV','确认工作表、表头和需要处理的记录范围。'],
    ['02','添加 Word / PDF 模板','识别模板字段，并为每种交付文件建立绑定。'],
    ['03','映射并预览','把数据列连接到字段，抽查日期、金额、图片和条件内容。'],
    ['04','运行生成前校验','先处理缺失必填项、重复编号、无效路径和未绑定字段。'],
    ['05','批量生成并打包','按记录生成文件，应用命名与目录规则后整理成交付包。']
  ] : [
    ['01','Import Excel or CSV','Confirm the worksheet, header row, and the records included in the batch.'],
    ['02','Add Word or PDF templates','Detect template fields and bind the templates required for each deliverable.'],
    ['03','Map and preview','Connect columns to fields and sample-check dates, totals, images, and conditional content.'],
    ['04','Run preflight validation','Resolve missing required values, duplicate IDs, invalid paths, and unbound fields first.'],
    ['05','Generate and package','Create files for each record, apply naming and folder rules, and assemble the delivery package.']
  ];
  const capabilities = zh ? [
    ['table','字段与重复数据','填充文本、数字、日期和编号，并在同一映射上反复处理新批次。'],
    ['rules','条件、计算与动态素材','按数据决定内容，组合字段、计算值，并插入二维码、签名或图片。'],
    ['check','命名、目录与校验','用字段自动命名文件、按客户或项目建目录，并在生成前发现缺项。']
  ] : [
    ['table','Fields and repeated records','Fill text, numbers, dates, and identifiers, then reuse the mapping for future batches.'],
    ['rules','Conditions, calculations, and assets','Choose content from record data, combine or calculate values, and insert QR codes, signatures, or images.'],
    ['check','Naming, folders, and validation','Name files from fields, group them by customer or project, and catch missing information before generation.']
  ];
  const useCases = zh ? [
    ['trade','报价与外贸单据','从价格表生成报价单、形式发票、装箱单和客户目录。'],
    ['engineering','工程项目交付','从项目台账生成传递单、文件清单、验收表和交付目录。'],
    ['hr','HR 入职资料','从员工花名册生成合同、登记表、确认书和员工文件夹。'],
    ['compliance','合规与认证','从标准清单生成申请表、声明、证据索引和申报目录。']
  ] : [
    ['trade','Quotations and trade documents','Create quotations, proforma invoices, packing lists, and customer folders from a price sheet.'],
    ['engineering','Engineering handover','Create transmittals, registers, acceptance forms, and delivery folders from a project register.'],
    ['hr','HR onboarding','Create contracts, registration forms, acknowledgements, and employee folders from a roster.'],
    ['compliance','Compliance and certification','Create applications, declarations, evidence indexes, and submission folders from a controlled checklist.']
  ];
  const body = `${pageHero(
    locale,
    zh ? 'EXCEL / CSV → WORD / PDF' : 'EXCEL / CSV → WORD / PDF',
    zh ? '从 Excel 或 CSV 批量生成 Word 和 PDF 文档' : 'Batch-generate Word and PDF documents from Excel or CSV',
    zh ? '把每行数据映射到现有模板，在本机完成预览、校验、命名和多文件打包，减少复制粘贴与漏项。' : 'Map every row to existing templates, then preview, validate, name, and package multiple files locally—without repetitive copy-paste or customer-file uploads.'
  )}
  <section class="section"><div class="container"><div class="section-heading"><p class="eyebrow">${zh?'字段映射示例':'FIELD-MAPPING EXAMPLE'}</p><h2>${zh?'一行表格数据，变成一套受控文档':'One spreadsheet row becomes a controlled document set'}</h2><p>${zh?'列名不必和模板字段完全一致；建立映射后，同一工作流可以用于后续批次。':'Column names do not need to match placeholders exactly. Once mapped, the same workflow can be reused for future batches.'}</p></div><table class="comparison mapping-example"><thead><tr><th>${zh?'数据列':'Spreadsheet column'}</th><th>${zh?'模板字段':'Template field'}</th><th>${zh?'示例值':'Example value'}</th></tr></thead><tbody>${fields.map(row=>`<tr>${row.map(value=>`<td>${value}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>
  <section class="section alt"><div class="container"><div class="section-heading center"><p class="eyebrow">${zh?'五步工作流':'FIVE-STEP WORKFLOW'}</p><h2>${zh?'先检查，再批量生成和交付':'Validate first, then generate and deliver in batches'}</h2></div><div class="workflow-list">${steps.map(([number,title,copy])=>`<div class="workflow-item" data-reveal><span class="workflow-number">${number}</span><h3>${title}</h3><p>${copy}</p></div>`).join('')}</div></div></section>
  <section class="section"><div class="container"><div class="section-heading"><p class="eyebrow">${zh?'MVP 范围':'MVP SCOPE'}</p><h2>${zh?'围绕批量文档交付的核心能力':'Core capabilities for batch document delivery'}</h2><p>${zh?'公测阶段会明确标注功能成熟度；复杂模板应先用脱敏副本验证，再进入正式业务流程。':'Beta releases state feature maturity clearly. Test complex templates with sanitized copies before adopting them in a production workflow.'}</p></div><div class="cards">${capabilities.map(([ico,title,copy])=>`<article class="feature-card" data-reveal><span class="card-icon">${icon(ico)}</span><h3>${title}</h3><p>${copy}</p></article>`).join('')}</div><div class="download-note"><strong>${zh?'当前限制说明：':'Current beta note:'}</strong> ${zh?'复杂 Word 原版式保真、可视化 PDF 坐标映射和高级规则仍在持续增强；具体支持范围以对应版本发布说明为准。':'Complex Word layout fidelity, visual PDF coordinate mapping, and advanced rules are still improving. Refer to each release note for the exact supported scope.'}</div></div></section>
  <section class="section alt"><div class="container"><div class="section-heading"><p class="eyebrow">${zh?'常见用途':'COMMON WORKFLOWS'}</p><h2>${zh?'同一套方法，服务不同交付场景':'The same controlled process across different deliverables'}</h2></div><div class="industry-grid">${useCases.map(([key,title,copy],index)=>`<article class="industry-card" data-number="0${index+1}" data-reveal><span class="tag">${zh?'行业场景':'Industry workflow'}</span><h3>${title}</h3><p>${copy}</p><a class="industry-link" href="${urlFor(locale,key)}">${zh?'查看完整流程':'Explore the workflow'} ${icon('arrow')}</a></article>`).join('')}</div></div></section>
  <section class="section"><div class="container privacy-grid"><div class="privacy-diagram" data-reveal><span class="no-cloud">${zh?'文件不上传':'NO FILE UPLOAD'}</span><div class="device-box"><div class="device-top"><i></i><span><b>${zh?'你的电脑':'Your computer'}</b><small>${zh?'本地处理边界':'LOCAL PROCESSING BOUNDARY'}</small></span></div><div class="device-flow"><span>Excel / CSV <i></i></span><span>Word / PDF <i></i></span><span>${zh?'命名交付包':'Named deliverables'} <i></i></span></div></div></div><div><p class="eyebrow">${zh?'隐私优先':'PRIVACY FIRST'}</p><div class="section-heading"><h2>${zh?'敏感表格和模板保留在本机':'Keep sensitive spreadsheets and templates on your computer'}</h2><p>${zh?'桌面应用在本机读取源数据、处理模板并写入结果。官网不需要接触客户名称、价格、员工信息、签名或文件正文。':'The desktop app reads source data, processes templates, and writes output locally. The website does not need customer names, prices, employee information, signatures, or document contents.'}</p></div><div class="hero-actions"><a class="button secondary" href="${urlFor(locale,'security')}">${zh?'了解本地处理边界':'Read the security design'} ${icon('arrow')}</a></div></div></div></section>
  ${faqSection(locale, batchFaqItems(locale), zh?'Excel 批量生成 Word/PDF 的常见问题':'Questions about Excel-to-Word/PDF generation')}
  ${cta(locale,zh?'用一份真实表格和模板验证批量流程':'Validate the batch workflow with a real spreadsheet and template',zh?'申请公测前可先使用脱敏副本，确认字段、版式和输出规则是否适合你的场景。':'Start with sanitized copies to confirm that field mapping, layout, and output rules fit your use case.')}`;
  return layout(locale, 'batch', body, { faq: batchFaqItems(locale) });
}

const industryContent = {
  en: {
    trade: ['TRADE QUOTATION WORKFLOW','From one price sheet to a complete customer package','Generate quotations, proforma invoices, packing lists, and customer folders with consistent data and naming.',['Quotation.pdf','Proforma_Invoice.pdf','Packing_List.pdf','Attachments/'],[['Stop retyping the same customer and product data','Bind approved quotation and invoice templates once, then reuse them for each batch.'],['Catch commercial mistakes before sending','Validate missing incoterms, currency, validity dates, addresses, and product rows.'],['Deliver a professional folder every time','Name and organize files by customer, quotation number, date, or salesperson.']]],
    engineering: ['ENGINEERING DELIVERY WORKFLOW','Turn registers and templates into a structured handover package','Generate project covers, transmittals, document registers, acceptance forms, and consistent delivery folders locally.',['00_Cover.pdf','01_Transmittal.pdf','02_Document_Register.pdf','Drawings/','Certificates/'],[['Use one project register as the source','Map project, contractor, revision, drawing, and approval fields into approved templates.'],['Reduce missing-file surprises','Check required records and expected attachments before building the final package.'],['Make every package navigable','Apply project numbering and directory rules across all generated files.']]],
    hr: ['HR ONBOARDING WORKFLOW','Create complete onboarding files without uploading personal data','Generate contracts, registration forms, policy acknowledgements, and employee folders from a controlled roster.',['Employee_Contract.pdf','Personal_Information.pdf','Policy_Acknowledgement.pdf','Required_Documents/'],[['Keep personal data on the HR computer','Source spreadsheets, signatures, and generated documents remain in the local workflow.'],['Use conditions for different employee types','Include clauses and forms based on location, role, contract type, or benefits eligibility.'],['See what is missing before day one','Validate IDs, dates, addresses, bank fields, and required supporting documents.']]],
    compliance: ['COMPLIANCE WORKFLOW','Build traceable, validated submission packages','Assemble applications, declarations, evidence indexes, certificates, and named folders from approved inputs.',['00_Submission_Index.pdf','01_Application.pdf','02_Declaration.pdf','Evidence/','Certificates/'],[['Turn a checklist into an executable workflow','Connect every required field and evidence item to a template or validation rule.'],['Handle client and jurisdiction variations','Use conditional fields and template combinations for different schemes or countries.'],['Deliver a package reviewers can follow','Generate a clear index and stable folder structure with consistent naming.']]]
  },
  zh: {
    trade: ['贸易报价工作流','从一份价格表生成完整客户交付包','统一生成报价单、形式发票、装箱单与客户目录，数据和命名保持一致。',['报价单.pdf','形式发票.pdf','装箱单.pdf','附件/'],[['不再重复录入客户和产品信息','一次绑定标准报价与发票模板，后续批次直接复用。'],['发送前发现商务信息错误','校验贸易条款、币种、有效期、地址和产品明细等必填项。'],['每次都交付专业目录','按客户、报价编号、日期或业务员自动命名和整理。']]],
    engineering: ['工程项目交付工作流','把项目台账与模板变成结构化交付包','在本地生成项目封面、传递单、文件清单、验收表和统一交付目录。',['00_交付封面.pdf','01_文件传递单.pdf','02_文件清单.pdf','图纸/','证书/'],[['以一份项目台账作为数据源','把项目、单位、版本、图纸和审批字段绑定到标准模板。'],['交付前发现缺件','建立必需记录和附件预期，生成最终包前统一检查。'],['让每套交付包都容易查找','按项目编码和目录规则批量命名全部生成文件。']]],
    hr: ['HR 入职工作流','无需上传个人信息，生成完整入职资料','从受控花名册生成合同、登记表、制度确认书和员工目录。',['劳动合同.pdf','个人信息登记表.pdf','制度确认书.pdf','待提交资料/'],[['个人信息留在 HR 电脑上','源表格、签名和生成文档都留在本地处理流程。'],['按员工类型使用条件字段','根据地区、岗位、合同类型或福利资格决定条款和表单。'],['入职前看清缺什么','校验证件号、日期、地址、银行字段和必需附件。']]],
    compliance: ['合规与认证工作流','组装可追溯、经过校验的申报文件包','从标准输入生成申请表、声明、证据索引、证书与命名目录。',['00_申报目录.pdf','01_申请表.pdf','02_声明.pdf','证据材料/','证书/'],[['把清单变成可执行流程','让每个必需字段和证据项都对应模板字段或校验规则。'],['处理客户与地区差异','针对不同体系或国家使用条件字段和多模板组合。'],['交付审核人员看得懂的文件包','生成清晰目录、稳定结构和一致命名。']]]
  }
};

const industryDetails = {
  en: {
    trade: {
      fields: [
        ['Customer and address','{customer_name}, {address}','Recipient and invoice details'],
        ['Quotation number','{quotation_no}','Stable document ID and file name'],
        ['Currency and Incoterm','{currency}, {incoterm}','Commercial terms to validate'],
        ['Validity and delivery','{valid_until}, {lead_time}','Dates and promise language'],
        ['Product lines','{sku}, {qty}, {unit_price}','Repeated rows and calculated totals']
      ],
      faq: [
        ['Can one Excel workbook create a quotation, proforma invoice, and packing list?','The workflow is designed to bind several approved templates to the same record, so one customer row or order group can produce a coordinated document set. Confirm exact multi-template scope in the beta release notes.'],
        ['Can DocFlow Local calculate totals, taxes, or currency values?','Conditions and calculations are part of the planned advanced workflow. During beta, test the formulas and rounding rules used by your business before relying on generated totals.'],
        ['Does customer and pricing data leave the sales computer?','No. The desktop workflow is designed to read the workbook, templates, and output files locally without uploading their contents to the product website.']
      ]
    },
    engineering: {
      fields: [
        ['Project identity','{project_code}, {client}','Folder structure and document headers'],
        ['Document identity','{document_no}, {title}','Register rows and generated covers'],
        ['Revision and status','{revision}, {status}','Revision control and issue state'],
        ['Issue purpose and date','{issue_for}, {issue_date}','Transmittal and approval context'],
        ['Attachment path','{source_file}','Expected drawing, certificate, or evidence file']
      ],
      faq: [
        ['Can DocFlow Local use an existing engineering document register?','The intended workflow starts from an Excel or CSV register and maps its project, document, revision, and issue fields into approved templates. Use a sanitized register during beta validation.'],
        ['Does it replace a document management system or common data environment?','No. DocFlow Local focuses on local document generation, validation, naming, and packaging. It can prepare a handover package for delivery into your existing document-control system.'],
        ['Can it flag missing drawings or certificates before packaging?','Preflight rules can compare required values and expected file references before generation. The precise attachment-checking depth is stated in each beta release.']
      ]
    },
    hr: {
      fields: [
        ['Employee identity','{employee_name}, {employee_id}','Contracts and personal forms'],
        ['Role and department','{job_title}, {department}','Role-specific clauses and notices'],
        ['Start date and location','{start_date}, {work_location}','Dates, jurisdiction, and onboarding schedule'],
        ['Contract type','{contract_type}','Conditional forms and contract language'],
        ['Required documents','{document_path}, {signature_path}','Local supporting files and signatures']
      ],
      faq: [
        ['Can different employee types receive different documents or clauses?','The planned conditional workflow can select content and templates by role, location, contract type, or another roster field. Validate every legal template and condition with HR or counsel.'],
        ['Is DocFlow Local an HRIS or electronic-signature platform?','No. It is a local document-generation and packaging tool. Employee systems, approval workflows, and legally compliant electronic signatures remain separate unless explicitly integrated.'],
        ['How is personal data protected?','The desktop workflow processes the roster, templates, signatures, and generated files on the HR computer. The product website does not need the contents of those files.']
      ]
    },
    compliance: {
      fields: [
        ['Client or legal entity','{entity_name}, {registration_no}','Applicant identity across forms'],
        ['Scheme and jurisdiction','{scheme}, {jurisdiction}','Template and rule selection'],
        ['Application reference','{application_no}','Traceable naming and index entries'],
        ['Declaration dates','{signed_date}, {expiry_date}','Freshness and validity checks'],
        ['Evidence references','{evidence_id}, {evidence_path}','Index rows and expected local files']
      ],
      faq: [
        ['Can one workflow support different schemes or jurisdictions?','Conditional fields and template combinations are designed to handle controlled variations. Each scheme should still have an approved template set and its own validation rules.'],
        ['Does DocFlow Local decide whether a submission is compliant?','No. It helps generate, name, validate, and organize documents from rules you define. The responsible consultant or organization remains accountable for regulatory interpretation and final review.'],
        ['Can evidence files be checked before the package is delivered?','Preflight validation can identify missing required values and expected file references. Exact evidence-file checks depend on the beta version and configured workflow.']
      ]
    }
  },
  zh: {
    trade: {
      fields: [
        ['客户与地址','{customer_name}, {address}','报价抬头、收件与开票信息'],
        ['报价编号','{quotation_no}','稳定的单据编号和文件名'],
        ['币种与贸易条款','{currency}, {incoterm}','生成前需要校验的商务条款'],
        ['有效期与交期','{valid_until}, {lead_time}','日期和承诺表述'],
        ['产品明细','{sku}, {qty}, {unit_price}','重复行、数量、单价和合计']
      ],
      faq: [
        ['一份 Excel 能同时生成报价单、形式发票和装箱单吗？','这套流程面向“同一条客户或订单记录绑定多个标准模板”的场景，从而生成相互一致的一组文件。具体多模板范围以公测版本说明为准。'],
        ['能否计算合计、税费或币种金额？','条件和计算属于规划中的高级工作流。公测阶段应先验证企业自己的公式、税务口径和舍入规则，再使用生成金额。'],
        ['客户名称和价格数据会离开业务电脑吗？','不会。桌面端在本机读取表格、模板和输出文件，不需要把这些内容上传到产品官网。']
      ]
    },
    engineering: {
      fields: [
        ['项目标识','{project_code}, {client}','目录结构和文件抬头'],
        ['文件标识','{document_no}, {title}','台账记录、封面和文件清单'],
        ['版本与状态','{revision}, {status}','版本控制与签发状态'],
        ['签发用途与日期','{issue_for}, {issue_date}','传递单和审批背景'],
        ['附件路径','{source_file}','预期图纸、证书或证据文件']
      ],
      faq: [
        ['可以直接使用现有工程文件台账吗？','目标流程从 Excel 或 CSV 台账开始，把项目、文件、版本和签发字段映射到标准模板。公测验证时建议先使用脱敏台账。'],
        ['它会替代文控系统或 CDE 吗？','不会。DocFlow Local 聚焦本地生成、校验、命名和打包，可把整理好的交付包送入企业现有文控系统。'],
        ['打包前能发现缺少的图纸或证书吗？','生成前规则可以检查必填值和预期文件引用。实际附件检查深度会在每个公测版本说明中明确。']
      ]
    },
    hr: {
      fields: [
        ['员工身份','{employee_name}, {employee_id}','合同和个人信息表'],
        ['岗位与部门','{job_title}, {department}','岗位条款和入职通知'],
        ['入职日期与地点','{start_date}, {work_location}','日期、地区和入职安排'],
        ['合同类型','{contract_type}','条件表单和合同内容'],
        ['所需资料','{document_path}, {signature_path}','本地附件和签名图片']
      ],
      faq: [
        ['不同员工类型可以生成不同文件或条款吗？','规划中的条件工作流可按岗位、地点、合同类型或其他花名册字段选择内容和模板。所有法律模板与条件仍应由 HR 或法律顾问审核。'],
        ['DocFlow Local 是 HRIS 或电子签平台吗？','不是。它是本地文档生成与打包工具；员工系统、审批流程和具备法律效力的电子签名仍是独立能力，除非另行集成。'],
        ['个人信息如何保护？','桌面端在 HR 电脑上处理花名册、模板、签名和生成文件，产品官网不需要接触这些文件内容。']
      ]
    },
    compliance: {
      fields: [
        ['客户或法律实体','{entity_name}, {registration_no}','申请主体在多份表单中的统一身份'],
        ['体系与地区','{scheme}, {jurisdiction}','选择模板与规则'],
        ['申请编号','{application_no}','可追溯命名和目录条目'],
        ['声明日期','{signed_date}, {expiry_date}','时效与有效性检查'],
        ['证据引用','{evidence_id}, {evidence_path}','证据索引和预期本地文件']
      ],
      faq: [
        ['同一工作流能否支持不同认证体系或地区？','条件字段和模板组合可用于受控差异，但每个体系仍应使用经过批准的模板集和独立校验规则。'],
        ['DocFlow Local 会判断申报材料是否合规吗？','不会。它根据用户定义的规则生成、命名、检查和整理文件；法规解释与最终审核仍由责任顾问或组织完成。'],
        ['交付前可以检查证据文件是否缺失吗？','生成前校验可识别必填数据和预期文件引用的缺失。实际证据文件检查范围取决于公测版本与已配置工作流。']
      ]
    }
  }
};

function industryPage(locale,key) {
  const zh = locale === 'zh';
  const [eye,title,lead,files,benefits] = industryContent[locale][key];
  const details = industryDetails[locale][key];
  const body = `<div class="container industry-hero-grid"><section class="page-hero"><p class="eyebrow">${eye}</p><h1>${title}</h1><p>${lead}</p><div class="page-actions start"><a class="button primary" href="${betaEmail[locale]}">${locales[locale].beta} ${icon('arrow')}</a><a class="button secondary" href="${urlFor(locale,'templates')}">${zh?'查看模板':'View templates'}</a></div></section><aside class="deliverable-box" data-reveal><small>${zh?'示例交付结构':'EXAMPLE DELIVERY STRUCTURE'}</small><h2>${zh?'批次输出目录':'Batch output folder'}</h2><div class="file-tree"><div>📁 {client}_{project}/</div>${files.map(f=>`<div>${f.endsWith('/')?'📁':'↳'} ${f}</div>`).join('')}</div></aside></div>
  <section class="section alt"><div class="container"><div class="section-heading"><p class="eyebrow">${zh?'工作流价值':'WORKFLOW VALUE'}</p><h2>${zh?'把容易出错的步骤变成生成前规则':'Turn error-prone steps into preflight rules'}</h2></div><div class="cards">${benefits.map(([h,p],i)=>`<article class="feature-card" data-reveal><span class="card-icon">${icon(['table','check','folder'][i])}</span><h3>${h}</h3><p>${p}</p></article>`).join('')}</div></div></section>
  <section class="section"><div class="container"><div class="section-heading"><p class="eyebrow">${zh?'输入与校验':'INPUTS AND VALIDATION'}</p><h2>${zh?'生成前需要统一的关键字段':'Key fields to standardize before generation'}</h2><p>${zh?'下面是典型字段示例。实际工作流应使用企业批准的数据字典、模板和校验规则。':'These are representative fields. A production workflow should use your organization’s approved field dictionary, templates, and validation rules.'}</p></div><table class="comparison mapping-example"><thead><tr><th>${zh?'数据内容':'Data item'}</th><th>${zh?'字段示例':'Example field'}</th><th>${zh?'用途':'Purpose'}</th></tr></thead><tbody>${details.fields.map(row=>`<tr>${row.map(value=>`<td>${value}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>
  ${faqSection(locale, details.faq, zh?`${pageNames[locale][key]}常见问题`:`Questions about ${pageNames[locale][key]}`)}
  ${cta(locale,zh?'用你的真实模板验证这套流程':'Validate this workflow with your templates',zh?'申请公测或联系我们讨论行业模板与实施。':'Join the beta or talk to us about an industry pack and implementation.')}`;
  return layout(locale,key,body,{ faq: details.faq });
}

function guidesPage(locale) {
  const content = guideContent[locale].guides;
  const zh = locale === 'zh';
  const cards = [...guideKeys, 'benchmark'].map((key, index) => {
    const guide = guideContent[locale][key];
    const labels = zh
      ? ['批量生成', '流程对比', '字段映射', '图片资源', '生成前校验', '性能测试']
      : ['Batch generation', 'Workflow comparison', 'Field mapping', 'Embedded assets', 'Preflight validation', 'Benchmark'];
    return `<article class="feature-card guide-card" data-reveal>
      <span class="card-icon">${icon(['file', 'rules', 'table', 'qr', 'check', 'folder'][index])}</span>
      <p class="eyebrow">${labels[index]}</p>
      <h2><a href="${urlFor(locale, key)}">${guide.h1}</a></h2>
      <p>${guide.answer}</p>
      <a class="text-link" href="${urlFor(locale, key)}">${zh ? '阅读指南' : 'Read guide'} ${icon('arrow')}</a>
    </article>`;
  }).join('');
  const body = `<section class="page-hero compact"><div class="container"><p class="eyebrow">${content.eyebrow}</p><h1>${content.h1}</h1><p>${content.lead}</p></div></section>
  <section class="section"><div class="container"><div class="cards guide-cards">${cards}</div></div></section>
  ${cta(locale, zh ? '需要用真实模板验证流程？' : 'Need to validate a workflow with real templates?', zh ? '下载社区版，或联系我们讨论行业模板与实施。' : 'Download the Community Edition or talk to us about an industry workflow.')}`;
  return layout(locale, 'guides', body);
}

function guidePage(locale, key) {
  const guide = guideContent[locale][key];
  const zh = locale === 'zh';
  const steps = guide.steps.map(([title, copy], index) => `<li data-reveal><span>${String(index + 1).padStart(2, '0')}</span><div><h2>${title}</h2><p>${copy}</p></div></li>`).join('');
  const facts = guide.facts.map(fact => `<li><i>✓</i><span>${fact}</span></li>`).join('');
  const rows = guide.table.rows.map(row => `<tr>${row.map(value => `<td>${value}</td>`).join('')}</tr>`).join('');
  const related = guideKeys
    .filter(candidate => candidate !== key)
    .slice(0, 3)
    .map(candidate => `<a href="${urlFor(locale, candidate)}">${guideContent[locale][candidate].name} ${icon('arrow')}</a>`)
    .join('');
  const body = `<section class="page-hero guide-hero"><div class="container"><p class="eyebrow">${guide.eyebrow}</p><h1>${guide.h1}</h1><div class="answer-card"><strong>${zh ? '简要答案' : 'Short answer'}</strong><p>${guide.answer}</p></div></div></section>
  <section class="section alt"><div class="container"><div class="section-heading"><p class="eyebrow">${zh ? '实施步骤' : 'IMPLEMENTATION'}</p><h2>${zh ? '把流程拆成可检查的步骤' : 'Build the workflow as a sequence you can verify'}</h2></div><ol class="guide-steps">${steps}</ol></div></section>
  <section class="section"><div class="container"><div class="section-heading"><p class="eyebrow">${zh ? '示例与边界' : 'EXAMPLE AND SCOPE'}</p><h2>${zh ? '用明确数据表达规则' : 'Make the rules explicit in the data'}</h2></div><table class="comparison mapping-example"><thead><tr>${guide.table.headings.map(heading => `<th>${heading}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></section>
  <section class="section alt"><div class="container guide-facts"><div><p class="eyebrow">${zh ? '已核实事实' : 'VERIFIABLE FACTS'}</p><h2>${zh ? '当前版本需要明确说明的内容' : 'What the current version states explicitly'}</h2></div><ul class="privacy-points">${facts}</ul></div></section>
  ${faqSection(locale, guide.faq, zh ? '围绕这个流程的常见问题' : 'Questions about this workflow')}
  <section class="section"><div class="container"><div class="section-heading"><p class="eyebrow">${zh ? '继续阅读' : 'RELATED GUIDES'}</p><h2>${zh ? '建立完整的本地文档工作流' : 'Continue building the local document workflow'}</h2></div><div class="related-guides">${related}</div></div></section>
  ${cta(locale, zh ? '使用脱敏文件验证你的模板' : 'Validate your templates with sanitized files', zh ? '下载社区版，或联系我们讨论行业模板和实施。' : 'Download the Community Edition or contact us about an industry workflow.')}`;
  return layout(locale, key, body, { faq: guide.faq, article: true });
}

async function writePage(pathname, html) {
  const clean = pathname.replace(/^\//, '');
  const target = pathname.endsWith('/') ? join(dist, clean, 'index.html') : join(dist, clean);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, html);
}

async function build() {
  await rm(dist, { recursive: true, force: true });
  await mkdir(join(dist, 'assets'), { recursive: true });
  await copyFile(join(siteRoot, 'src', 'styles.css'), join(dist, 'assets', 'styles.css'));
  await copyFile(join(siteRoot, 'src', 'site.js'), join(dist, 'assets', 'site.js'));
  await copyFile(join(siteRoot, 'src', 'analytics.js'), join(dist, 'assets', 'analytics.js'));
  await copyFile(join(siteRoot, 'src', 'docflow-local-og.png'), join(dist, 'assets', 'docflow-local-og.png'));
  await copyFile(join(projectRoot, 'build', 'icon.png'), join(dist, 'assets', 'icon.png'));

  for (const locale of ['en','zh']) {
    await writePage(urlFor(locale,'home'), home(locale));
    await writePage(urlFor(locale,'pricing'), pricingPage(locale));
    await writePage(urlFor(locale,'security'), securityPage(locale));
    await writePage(urlFor(locale,'templates'), templatesPage(locale));
    await writePage(urlFor(locale,'download'), downloadPage(locale));
    await writePage(urlFor(locale,'batch'), batchPage(locale));
    for (const key of ['trade','engineering','hr','compliance']) await writePage(urlFor(locale,key), industryPage(locale,key));
    await writePage(urlFor(locale, 'guides'), guidesPage(locale));
    for (const key of guideKeys) await writePage(urlFor(locale, key), guidePage(locale, key));
    await writePage(urlFor(locale, 'benchmark'), guidePage(locale, 'benchmark'));
  }

  const allUrls = Object.values(pages).flatMap(localePages => Object.values(localePages).map(p => `${siteUrl}${p.path}`));
  await writeFile(join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${allUrls.map(url=>`  <url>\n    <loc>${url}</loc>\n    <lastmod>${lastModified}</lastmod>\n  </url>`).join('\n')}\n</urlset>\n`);
  await writeFile(join(dist, 'robots.txt'), `User-agent: *
Content-Signal: search=yes, ai-input=yes, ai-train=no, use=reference
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Claude-SearchBot
Allow: /

User-agent: Claude-User
Allow: /

User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /

User-agent: GPTBot
Disallow: /

User-agent: ClaudeBot
Disallow: /

User-agent: Google-Extended
Disallow: /

Sitemap: ${siteUrl}/sitemap.xml
`);
  await writeFile(join(dist, `${indexNowKey}.txt`), indexNowKey);
  await writeFile(join(dist, 'llms.txt'), `# DocFlow Local

> DocFlow Local is a privacy-first document automation platform. Its open Core reads JSON, Excel, or CSV data and drives DOCX generation through a CLI, local API, and plugin contracts; Desktop Community turns those capabilities into validated, consistently named delivery packages without uploading document content.

## Product
- [Homepage](${siteUrl}/)
- [Excel to Word and PDF workflow](${siteUrl}/features/excel-to-word-pdf/)
- [Security and privacy](${siteUrl}/security/)
- [Pricing](${siteUrl}/pricing/)
- [Download and beta](${siteUrl}/download/)
- [Open-source repository](${repoUrl})
- [Core, CLI, API, and plugin architecture](${repoUrl}/blob/main/PLATFORM_ARCHITECTURE.md)

## Practical guides
- [Document automation guides](${siteUrl}/guides/)
- [Batch-generate PDFs from Excel](${siteUrl}/guides/batch-generate-pdf-from-excel/)
- [Word mail merge alternative](${siteUrl}/guides/word-mail-merge-alternative/)
- [Map Excel columns to Word fields](${siteUrl}/guides/map-excel-columns-to-word-template-fields/)
- [Insert QR codes, signatures, and images](${siteUrl}/guides/insert-qr-signatures-images/)
- [Validate missing fields before generation](${siteUrl}/guides/validate-missing-fields-before-generation/)
- [Reproducible local benchmark](${siteUrl}/benchmarks/local-batch-generation/)

## Chinese
- [中文首页](${siteUrl}/zh/)
- [中文指南](${siteUrl}/zh/guides/)
- [安全与隐私](${siteUrl}/zh/security/)

## Scope
DocFlow Local is a document generation and packaging tool. It does not certify business, legal, tax, or regulatory correctness. Image-based signatures are not certificate-backed digital signatures. Refer to the current release notes and repository documentation for exact supported formats and limits.
`);
  await writeFile(join(dist, '_headers'), `/*\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()\n  Content-Security-Policy: default-src 'self'; style-src 'self'; script-src 'self' https://www.googletagmanager.com; img-src 'self' data: https://www.google-analytics.com https://www.googletagmanager.com; connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://analytics.google.com https://*.analytics.google.com https://www.googletagmanager.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self' mailto:\n\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n`);
  await writeFile(join(dist, '404.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page not found | DocFlow Local</title><meta name="description" content="The requested DocFlow Local page could not be found."><meta name="robots" content="noindex,follow"><meta name="theme-color" content="#0a1b2a"><link rel="icon" href="/assets/icon.png"><link rel="manifest" href="/site.webmanifest"><link rel="stylesheet" href="/assets/styles.css"><script async src="https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}"></script><script src="/assets/analytics.js"></script></head><body>${header('en','home')}<main id="main">${pageHero('en','404','This page is not in the package.','Return to the product site or switch to the Chinese homepage.',false)}<div class="container"><div class="page-actions"><a class="button primary" href="/">English homepage</a><a class="button secondary" href="/zh/">中文首页</a></div></div></main>${footer('en')}<script src="/assets/site.js" defer></script></body></html>`);
  await writeFile(join(dist, 'site.webmanifest'), JSON.stringify({ name:'DocFlow Local', short_name:'DocFlow', start_url:'/', display:'standalone', background_color:'#f3f7f8', theme_color:'#0a1b2a', icons:[{src:'/assets/icon.png',sizes:'1024x1024',type:'image/png'}] }, null, 2));
  process.stdout.write(`Built ${allUrls.length} localized pages in ${dist}\n`);
}

await build();
