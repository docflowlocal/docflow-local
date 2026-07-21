import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(here, '..');
const projectRoot = resolve(siteRoot, '..');
const dist = join(siteRoot, 'dist');
const siteUrl = 'https://docflowlocal.com';
const repoUrl = 'https://github.com/docflowlocal/docflow-local';
const betaEmail = 'mailto:hello@docflowlocal.com?subject=DocFlow%20Local%20Beta';
const salesEmail = 'mailto:sales@docflowlocal.com?subject=DocFlow%20Local';

const locales = {
  en: {
    code: 'en', label: 'EN', switchLabel: '中文', prefix: '',
    skip: 'Skip to content', menu: 'Open navigation',
    nav: { product: 'Product', industries: 'Industries', templates: 'Templates', pricing: 'Pricing', security: 'Security' },
    beta: 'Join beta', source: 'View source', download: 'Download',
    footerIntro: 'Privacy-first document automation for teams that work with sensitive files.',
    footer: {
      product: 'Product', company: 'Company', resources: 'Resources',
      pricing: 'Pricing', security: 'Security', templates: 'Templates', download: 'Download',
      github: 'GitHub', roadmap: 'Roadmap', privacy: 'Privacy', contact: 'Contact',
      trade: 'Trade quotations', engineering: 'Engineering delivery', hr: 'HR onboarding', compliance: 'Compliance packages',
      legal: 'AGPL-3.0 community edition. DocFlow Local is a trademark of its owner.',
      locality: 'Designed for local-first work.'
    }
  },
  zh: {
    code: 'zh-CN', label: '中', switchLabel: 'EN', prefix: '/zh',
    skip: '跳到正文', menu: '打开导航',
    nav: { product: '产品', industries: '行业方案', templates: '模板', pricing: '价格', security: '安全' },
    beta: '申请内测', source: '查看源码', download: '下载',
    footerIntro: '为敏感文档而生的本地优先批量自动化工具。',
    footer: {
      product: '产品', company: '相关信息', resources: '行业方案',
      pricing: '价格', security: '安全', templates: '模板', download: '下载',
      github: 'GitHub', roadmap: '路线图', privacy: '隐私说明', contact: '联系我们',
      trade: '贸易报价', engineering: '工程交付', hr: 'HR 入职', compliance: '合规文件包',
      legal: '社区版采用 AGPL-3.0 许可。DocFlow Local 为其所有者商标。',
      locality: '为本地优先工作流而设计。'
    }
  }
};

const pages = {
  en: {
    home: {
      path: '/', title: 'DocFlow Local — Offline document automation',
      description: 'Turn Excel or CSV data and Word or PDF templates into validated, delivery-ready document packages. All processing stays on your computer.'
    },
    pricing: { path: '/pricing/', title: 'Pricing — DocFlow Local', description: 'Start with the open-source community edition, then add professional workflow capabilities, support, and industry template packs.' },
    security: { path: '/security/', title: 'Security & privacy — DocFlow Local', description: 'See how DocFlow Local keeps customer documents on your computer and minimizes data exposure.' },
    templates: { path: '/templates/', title: 'Industry templates — DocFlow Local', description: 'Document automation starter packs for trade, engineering, HR, education, compliance, and property teams.' },
    download: { path: '/download/', title: 'Download — DocFlow Local', description: 'Join the DocFlow Local public beta or build the community edition from source.' },
    trade: { path: '/industries/trade-quotation/', title: 'Trade quotation automation — DocFlow Local', description: 'Generate quotations, proforma invoices, packing lists, and customer delivery folders from one spreadsheet.' },
    engineering: { path: '/industries/engineering-delivery/', title: 'Engineering document packages — DocFlow Local', description: 'Create consistent project transmittals, cover sheets, registers, and handover packages locally.' },
    hr: { path: '/industries/hr-onboarding/', title: 'HR onboarding packages — DocFlow Local', description: 'Generate employee contracts, forms, notices, and structured onboarding folders without uploading personal data.' },
    compliance: { path: '/industries/compliance-package/', title: 'Compliance document packages — DocFlow Local', description: 'Assemble traceable, validated compliance files from structured data and approved templates.' }
  },
  zh: {
    home: { path: '/zh/', title: 'DocFlow Local——本地文档批量自动化工具', description: '把 Excel/CSV 数据与 Word/PDF 模板批量生成、校验并整理成交付包，处理全程留在本机。' },
    pricing: { path: '/zh/pricing/', title: '价格方案——DocFlow Local', description: '从开源社区版开始，按需升级专业工作流、服务支持和行业模板包。' },
    security: { path: '/zh/security/', title: '安全与隐私——DocFlow Local', description: '了解 DocFlow Local 如何让客户文档留在本机，并尽可能减少数据暴露。' },
    templates: { path: '/zh/templates/', title: '行业模板——DocFlow Local', description: '面向贸易、工程、HR、教育、合规与房产团队的文档自动化模板包。' },
    download: { path: '/zh/download/', title: '下载——DocFlow Local', description: '申请 DocFlow Local 公测，或从源代码构建社区版。' },
    trade: { path: '/zh/industries/trade-quotation/', title: '贸易报价自动化——DocFlow Local', description: '从一份表格生成报价单、形式发票、装箱单和客户交付目录。' },
    engineering: { path: '/zh/industries/engineering-delivery/', title: '工程项目交付包——DocFlow Local', description: '在本地生成统一的项目传递单、封面、文件清单与竣工交付包。' },
    hr: { path: '/zh/industries/hr-onboarding/', title: 'HR 入职资料包——DocFlow Local', description: '无需上传个人信息，即可生成合同、表单、通知与结构化入职目录。' },
    compliance: { path: '/zh/industries/compliance-package/', title: '合规文件包——DocFlow Local', description: '使用结构化数据和标准模板，组装可追溯、经过校验的合规文件包。' }
  }
};

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
    ['home', l.nav.product], ['home#industries', l.nav.industries], ['templates', l.nav.templates],
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
        <div class="footer-column"><strong>${f.product}</strong><a href="${urlFor(locale, 'pricing')}">${f.pricing}</a><a href="${urlFor(locale, 'security')}">${f.security}</a><a href="${urlFor(locale, 'templates')}">${f.templates}</a><a href="${urlFor(locale, 'download')}">${f.download}</a></div>
        <div class="footer-column"><strong>${f.resources}</strong><a href="${urlFor(locale, 'trade')}">${f.trade}</a><a href="${urlFor(locale, 'engineering')}">${f.engineering}</a><a href="${urlFor(locale, 'hr')}">${f.hr}</a><a href="${urlFor(locale, 'compliance')}">${f.compliance}</a></div>
        <div class="footer-column"><strong>${f.company}</strong><a href="${repoUrl}">${f.github}</a><a href="${repoUrl}/blob/main/ROADMAP.md">${f.roadmap}</a><a href="${repoUrl}/blob/main/PRIVACY.md">${f.privacy}</a><a href="${salesEmail}">${f.contact}</a></div>
      </div>
      <div class="footer-bottom"><span>© <span data-year>2026</span> DocFlow Local. ${f.legal}</span><span>${f.locality}</span></div>
    </div>
  </footer>`;
}

function layout(locale, current, body, schema = '') {
  const meta = pages[locale][current];
  const other = locale === 'en' ? 'zh' : 'en';
  const canonical = `${siteUrl}${meta.path === '/' ? '' : meta.path}`;
  const otherUrl = `${siteUrl}${urlFor(other, current)}`;
  return `<!doctype html>
<html lang="${locales[locale].code}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${meta.title}</title>
  <meta name="description" content="${meta.description}">
  <meta name="theme-color" content="#0a1b2a">
  <link rel="canonical" href="${canonical}">
  <link rel="alternate" hreflang="en" href="${siteUrl}${urlFor('en', current)}">
  <link rel="alternate" hreflang="zh-CN" href="${siteUrl}${urlFor('zh', current)}">
  <link rel="alternate" hreflang="x-default" href="${siteUrl}${urlFor('en', current)}">
  <link rel="icon" href="/assets/icon.png">
  <link rel="stylesheet" href="/assets/styles.css">
  <meta property="og:type" content="website"><meta property="og:site_name" content="DocFlow Local">
  <meta property="og:title" content="${meta.title}"><meta property="og:description" content="${meta.description}">
  <meta property="og:url" content="${canonical}"><meta property="og:locale" content="${locale === 'zh' ? 'zh_CN' : 'en_US'}">
  <meta property="og:locale:alternate" content="${locale === 'zh' ? 'en_US' : 'zh_CN'}">
  <meta name="twitter:card" content="summary"><meta name="twitter:title" content="${meta.title}"><meta name="twitter:description" content="${meta.description}">
  ${schema}
</head>
<body>
  ${header(locale, current)}
  <main id="main">${body}</main>
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
    eye: '文件不离开本机', h1: '把表格与模板，变成<span>可直接交付</span>的文档包。',
    lead: '导入 Excel 或 CSV，绑定 Word/PDF 模板，批量生成、自动命名、校验缺失字段并合并成交付包。全程本地运行。',
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
    workflowEye: '五步完成', workflowTitle: '让每次交付都有清晰路径', workflow: [['01','导入数据','Excel / CSV'],['02','添加模板','Word / PDF'],['03','绑定字段','可视化映射'],['04','运行校验','先发现问题'],['05','批量生成','整理并交付']],
    industriesEye: '为真实场景设计', industriesTitle: '先解决四类高频、刚需工作流', industriesLead: '每个行业页都从具体交付物出发，而不是堆砌泛用功能。',
    industries: [
      ['trade','贸易报价','报价单、形式发票、装箱单和客户目录一次生成。'],
      ['engineering','工程项目交付','传递单、图纸目录、验收资料和竣工包统一整理。'],
      ['hr','HR 入职资料','合同、登记表、告知书和员工目录批量完成。'],
      ['compliance','合规与认证','申请表、声明、证据清单和交付目录减少漏项。']
    ],
    privacyEye: '本地优先', privacyTitle: '敏感客户文档，不该成为云端副本', privacyLead: 'DocFlow Local 在你的电脑上读取数据、渲染文档并输出文件。我们的网站无需接触这些内容。',
    privacyPoints: ['桌面应用只绑定本机回环地址','处理中的原始文件保留在本地内存和本机目录','默认不收集文档内容或字段值','社区版源代码可审查'],
    openEye: '社区版开源', openTitle: '核心工作流可验证，也可由团队共同改进', openLead: '社区版采用 AGPL-3.0，包含真正可用的数据导入、模板映射、批量生成与校验基础能力。专业版聚焦高级规则、商业支持和效率增强。',
    pricingEye: '清晰升级', pricingTitle: '先用起来，再为高价值效率付费', faqEye: '常见问题', faqTitle: '购买前最常被问到的事',
    ctaTitle: '拿一套真实文件，完成第一次批量交付', ctaLead: '申请公测，或从 GitHub 查看社区版。'
  } : {
    eye: 'YOUR FILES NEVER LEAVE YOUR COMPUTER', h1: 'Turn spreadsheets and templates into <span>delivery-ready</span> packages.',
    lead: 'Import Excel or CSV data, bind Word/PDF template fields, generate in batches, validate missing values, name files, and assemble the final package — entirely offline.',
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
    workflowEye: 'Five clear steps', workflowTitle: 'Every delivery follows a visible path', workflow: [['01','Import data','Excel / CSV'],['02','Add templates','Word / PDF'],['03','Bind fields','Reusable mapping'],['04','Run preflight','Catch issues first'],['05','Generate','Package & deliver']],
    industriesEye: 'Designed around real work', industriesTitle: 'Starting with four frequent, high-value workflows', industriesLead: 'Each workflow begins with a concrete deliverable, not a generic list of features.',
    industries: [
      ['trade','Trade quotations','Generate quotations, proforma invoices, packing lists, and customer folders together.'],
      ['engineering','Engineering delivery','Standardize transmittals, drawing registers, acceptance records, and handover packs.'],
      ['hr','HR onboarding','Batch contracts, registration forms, notices, and employee folders locally.'],
      ['compliance','Compliance packages','Reduce omissions across applications, declarations, evidence lists, and final packages.']
    ],
    privacyEye: 'Local first', privacyTitle: 'Sensitive customer documents should not become cloud copies', privacyLead: 'DocFlow Local reads data, renders documents, and writes deliverables on your computer. Our website never needs the contents.',
    privacyPoints: ['Desktop service binds only to your loopback interface','Source files remain in local memory and local folders','No document contents or field values are collected by default','Community source is available for inspection'],
    openEye: 'Open-source community edition', openTitle: 'Inspect the core workflow. Improve it with the community.', openLead: 'The AGPL-3.0 community edition includes useful data import, template mapping, batch generation, and validation foundations. Pro focuses on advanced rules, support, and higher-throughput workflows.',
    pricingEye: 'A clear upgrade path', pricingTitle: 'Start working, then pay for higher-value efficiency', faqEye: 'FAQ', faqTitle: 'What teams ask before getting started',
    ctaTitle: 'Bring one real file set. Complete your first batch.', ctaLead: 'Join the beta or inspect the community edition on GitHub.'
  };
  const schema = `<script type="application/ld+json">${JSON.stringify({ '@context':'https://schema.org', '@type':'SoftwareApplication', name:'DocFlow Local', applicationCategory:'BusinessApplication', operatingSystem:'Windows, macOS', description:pages[locale].home.description, url:siteUrl, offers:[{'@type':'Offer',price:'0',priceCurrency:'USD',name:'Community'},{'@type':'Offer',price:'299',priceCurrency:'USD',name:'Pro annual'}] })}</script>`;
  const featureCards = t.features.map(([ico,title,copy]) => `<article class="feature-card" data-reveal><span class="card-icon">${icon(ico)}</span><h3>${title}</h3><p>${copy}</p></article>`).join('');
  const workflow = t.workflow.map(([num,title,copy]) => `<div class="workflow-item" data-reveal><span class="workflow-number">${num}</span><h3>${title}</h3><p>${copy}</p></div>`).join('');
  const industryCards = t.industries.map(([key,title,copy], i) => `<article class="industry-card" data-number="0${i+1}" data-reveal><span class="tag">${zh ? '行业工作流' : 'Industry workflow'}</span><h3>${title}</h3><p>${copy}</p><a class="industry-link" href="${urlFor(locale,key)}">${zh ? '查看方案' : 'Explore workflow'} ${icon('arrow')}</a></article>`).join('');
  const body = `<section class="hero"><div class="container hero-grid"><div class="hero-copy"><p class="eyebrow">${t.eye}</p><h1>${t.h1}</h1><p>${t.lead}</p><div class="hero-actions"><a class="button primary" href="${urlFor(locale,'download')}">${locales[locale].beta} ${icon('arrow')}</a><a class="button secondary" href="${repoUrl}">${locales[locale].source}</a></div><div class="micro-trust">${t.trust.map(x=>`<span><i></i>${x}</span>`).join('')}</div></div>${productMock(locale)}</div></section>
  <div class="trust-bar"><div class="container trust-inner"><span>${t.trustTitle}</span>${t.trustItems.map((x,i)=>`<span class="trust-item"><i class="trust-icon">${icon(['table','folder','file','shield'][i])}</i>${x}</span>`).join('')}</div></div>
  <section class="section" id="product"><div class="container"><div class="section-heading"><p class="eyebrow">${t.featuresEye}</p><h2>${t.featuresTitle}</h2><p>${t.featuresLead}</p></div><div class="cards">${featureCards}</div></div></section>
  <section class="section alt"><div class="container"><div class="section-heading center"><p class="eyebrow">${t.workflowEye}</p><h2>${t.workflowTitle}</h2></div><div class="workflow-list">${workflow}</div></div></section>
  <section class="section" id="industries"><div class="container"><div class="section-heading"><p class="eyebrow">${t.industriesEye}</p><h2>${t.industriesTitle}</h2><p>${t.industriesLead}</p></div><div class="industry-grid">${industryCards}</div></div></section>
  <section class="section alt"><div class="container privacy-grid"><div class="privacy-diagram" data-reveal><span class="no-cloud">${zh ? '无文档云上传' : 'NO DOCUMENT CLOUD'}</span><div class="device-box"><div class="device-top"><i></i><span><b>${zh ? '你的电脑' : 'Your computer'}</b><small>${zh ? '本地处理边界' : 'LOCAL PROCESSING BOUNDARY'}</small></span></div><div class="device-flow"><span>Excel / CSV <i></i></span><span>Word / PDF <i></i></span><span>${zh ? '输出交付包' : 'Delivery package'} <i></i></span></div></div></div><div><p class="eyebrow">${t.privacyEye}</p><div class="section-heading"><h2>${t.privacyTitle}</h2><p>${t.privacyLead}</p></div><ul class="privacy-points">${t.privacyPoints.map(x=>`<li><i>✓</i><span>${x}</span></li>`).join('')}</ul><div class="hero-actions"><a class="button secondary" href="${urlFor(locale,'security')}">${zh ? '查看安全设计' : 'Read the security design'} ${icon('arrow')}</a></div></div></div></section>
  <section class="open-source-band"><div class="container open-grid"><div><p class="eyebrow">${t.openEye}</p><h2>${t.openTitle}</h2><p>${t.openLead}</p><div class="hero-actions"><a class="button primary" href="${repoUrl}">${locales[locale].source} ${icon('arrow')}</a><a class="button secondary" href="${repoUrl}/blob/main/ROADMAP.md">${zh ? '查看路线图' : 'Read the roadmap'}</a></div></div><div class="code-card"><div class="code-card-top"><span><i></i> docflow-local</span><span>AGPL-3.0</span></div><pre><span class="accent">$</span> git clone ${repoUrl}.git
<span class="accent">$</span> npm install
<span class="accent">$</span> npm run dev

✓ ${zh ? '数据在本机处理' : 'data processed locally'}
✓ ${zh ? '社区可审查源码' : 'source open for inspection'}</pre></div></div></section>
  ${pricingSection(locale)}
  ${faqSection(locale)}
  ${cta(locale,t.ctaTitle,t.ctaLead)}`;
  return layout(locale, 'home', body, schema);
}

function pricingSection(locale, full = false) {
  const zh = locale === 'zh';
  const plans = zh ? [
    ['社区版','$0','个人探索与轻量批处理',['Excel / CSV 导入','基础 Word / PDF 字段映射','批量生成与完整性校验','社区支持'],repoUrl,'查看源码','secondary'],
    ['专业版','$299','高频报价与交付团队',['社区版全部能力','高级条件与计算规则','项目保存、复用和自动化','优先支持与专业更新'],betaEmail,'申请创始用户价','primary'],
    ['企业版','询价','需要部署与行业落地的组织',['专业版全部能力','行业模板与实施服务','部署、培训与 SLA','商业许可与定制集成'],salesEmail,'联系销售','dark']
  ] : [
    ['Community','$0','For exploration and lighter batch work',['Excel / CSV import','Core Word / PDF field mapping','Batch generation and integrity checks','Community support'],repoUrl,'View source','secondary'],
    ['Pro','$299','For frequent quotation and delivery teams',['Everything in Community','Advanced conditions and calculations','Saved projects and automation','Priority support and Pro updates'],betaEmail,'Get founding price','primary'],
    ['Business','Let’s talk','For deployment and industry rollout',['Everything in Pro','Industry packs and implementation','Deployment, training, and SLA','Commercial licensing and integration'],salesEmail,'Contact sales','dark']
  ];
  const cards = plans.map((p,i)=>`<article class="price-card${i===1?' featured':''}" data-reveal>${i===1?`<span class="popular">${zh?'推荐':'MOST POPULAR'}</span>`:''}<div class="plan-name">${p[0]}</div><div class="price">${p[1]}${i===1?`<small>/${zh?'年':'year'}</small>`:''}</div><p class="plan-copy">${p[2]}</p><ul class="plan-list">${p[3].map(x=>`<li><i>✓</i>${x}</li>`).join('')}</ul><a class="button ${p[6]}" href="${p[4]}">${p[5]}</a></article>`).join('');
  const heading = full ? '' : `<div class="section-heading center"><p class="eyebrow">${zh?'清晰升级':'A CLEAR UPGRADE PATH'}</p><h2>${zh?'先用起来，再为高价值效率付费':'Start working, then pay for higher-value efficiency'}</h2></div>`;
  return `<section class="section${full?'':' alt'}"><div class="container">${heading}<div class="pricing-grid">${cards}</div><p class="fine-print">${zh?'创始用户专业版首年 $149；续费前会清楚展示当期价格。行业模板包预计 $99–299/套，实施服务 $2,000 起。':'Founding customers: $149 for the first Pro year; the renewal price will be shown clearly before renewal. Industry packs are planned at $99–299, with implementation from $2,000.'}</p></div></section>`;
}

function faqSection(locale) {
  const zh = locale === 'zh';
  const items = zh ? [
    ['客户文件会上传吗？','不会。桌面端文档处理在本机完成；官网只承载产品信息与下载入口。'],
    ['社区版是真的可用，还是只是演示？','社区版包含数据导入、模板映射、批量生成、命名和校验等基础工作流。专业版提供高级规则、项目复用、效率增强与商业支持。'],
    ['Word 和 PDF 都支持吗？','MVP 支持两类模板。复杂 Word 原版式保真和可视化 PDF 坐标映射会持续增强，并在发布说明中明确成熟度。'],
    ['能否购买一次永久使用？','社区版可永久免费使用。专业版按年提供更新与支持；企业客户可沟通商业许可和长期维护方案。']
  ] : [
    ['Are customer files uploaded?','No. Desktop document processing runs on your computer. The website only hosts product information and release links.'],
    ['Is Community usable or just a demo?','Community includes the core workflow: data import, template mapping, batch generation, naming, and validation. Pro adds advanced rules, project reuse, productivity features, and commercial support.'],
    ['Do Word and PDF both work?','The MVP supports both template types. Complex Word layout fidelity and visual PDF coordinate mapping will keep improving, with maturity stated clearly in release notes.'],
    ['Can I buy it once and keep using it?','Community remains free to use. Pro is annual because it includes ongoing updates and support; businesses can discuss commercial licensing and longer-term maintenance.']
  ];
  return `<section class="section"><div class="container"><div class="section-heading center"><p class="eyebrow">${zh?'常见问题':'FAQ'}</p><h2>${zh?'购买前最常被问到的事':'What teams ask before getting started'}</h2></div><div class="faq">${items.map(([q,a])=>`<div class="faq-item"><button class="faq-button" type="button" data-faq-button aria-expanded="false"><span>${q}</span><i>+</i></button><div class="faq-answer"><p>${a}</p></div></div>`).join('')}</div></div></section>`;
}

function cta(locale, title, lead) {
  const zh = locale === 'zh';
  return `<section class="section"><div class="container"><div class="cta-panel"><div><h2>${title}</h2><p>${lead}</p></div><div class="cta-actions"><a class="button primary" href="${betaEmail}">${locales[locale].beta} ${icon('arrow')}</a><a class="button secondary" href="${repoUrl}">${zh?'GitHub 源码':'GitHub source'}</a></div></div></div></section>`;
}

function pageHero(locale, eye, title, lead, actions = true) {
  const zh = locale === 'zh';
  return `<section class="page-hero"><div class="container"><p class="eyebrow">${eye}</p><h1>${title}</h1><p>${lead}</p>${actions?`<div class="page-actions"><a class="button primary" href="${betaEmail}">${locales[locale].beta} ${icon('arrow')}</a><a class="button secondary" href="${repoUrl}">${zh?'查看社区版':'View Community'}</a></div>`:''}</div></section>`;
}

function pricingPage(locale) {
  const zh = locale === 'zh';
  const body = `${pageHero(locale,zh?'从开源到专业交付':'FROM OPEN SOURCE TO PROFESSIONAL DELIVERY',zh?'从免费开始，按工作流价值升级':'Start free. Upgrade when the workflow earns its place.',zh?'社区版让你验证核心流程；专业版和行业服务为高频团队提供更强自动化、支持与落地能力。':'Community lets you validate the core workflow. Pro and industry services add deeper automation, support, and rollout help for high-frequency teams.')}
  ${pricingSection(locale,true)}
  <section class="section alt"><div class="container"><div class="section-heading"><p class="eyebrow">${zh?'版本对比':'PLAN COMPARISON'}</p><h2>${zh?'核心能力一眼看清':'The capabilities that matter'}</h2></div><table class="comparison"><thead><tr><th>${zh?'能力':'Capability'}</th><th>${zh?'社区版':'Community'}</th><th>${zh?'专业版':'Pro'}</th><th>${zh?'企业版':'Business'}</th></tr></thead><tbody>${[
    [zh?'数据导入与基础映射':'Data import & core mapping','✓','✓','✓'],[zh?'批量生成与校验':'Batch generation & validation','✓','✓','✓'],[zh?'高级条件与计算':'Advanced conditions & calculations','—','✓','✓'],[zh?'项目复用与自动化':'Project reuse & automation','—','✓','✓'],[zh?'优先支持':'Priority support','—','✓','✓'],[zh?'商业许可、培训与 SLA':'Commercial license, training & SLA','—','—','✓']
  ].map(r=>`<tr><td>${r[0]}</td>${r.slice(1).map(v=>`<td class="${v==='✓'?'check':''}">${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>
  ${faqSection(locale)}${cta(locale,zh?'先用真实文件验证价值':'Validate the value with real files',zh?'申请创始用户资格，首年专业版计划价 $149。':'Apply as a founding user for a planned $149 first Pro year.')}`;
  return layout(locale,'pricing',body);
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
  <section class="section"><div class="container"><div class="detail-grid">${cards.map(([h,p,list])=>`<article class="detail-card" data-reveal><span class="card-icon">${icon('shield')}</span><h3>${h}</h3><p>${p}</p><ul>${list.map(x=>`<li>${x}</li>`).join('')}</ul></article>`).join('')}</div></div></section>
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
  <section class="section"><div class="container"><div class="template-grid">${packs.map((p,i)=>`<article class="template-card" data-reveal><div class="template-thumb"><span>PACK 0${i+1}</span></div><h3>${p[0]}</h3><p>${p[1]}</p><div class="template-meta"><span>${p[2]}</span><strong>${p[3]}</strong></div></article>`).join('')}</div><p class="fine-print">${zh?'模板包仍在公测准备阶段。最终内容、兼容性与价格以发布页为准。':'Template packs are being prepared for beta. Final contents, compatibility, and pricing will be stated on each release page.'}</p></div></section>
  ${cta(locale,zh?'有一套已经在使用的行业文件？':'Already have an industry file set?',zh?'我们可以把它整理成可重复执行的 DocFlow 工作流。':'We can turn it into a repeatable DocFlow workflow.')}`;
  return layout(locale,'templates',body);
}

function downloadPage(locale) {
  const zh = locale === 'zh';
  const body = `${pageHero(locale,zh?'公开测试准备中':'PUBLIC BETA IN PREPARATION',zh?'选择适合你的开始方式':'Choose how you want to get started',zh?'社区版源代码将通过 GitHub 发布；经过签名和公证的 Windows/macOS 安装包将在公测页提供。':'Community source will be published on GitHub. Signed and notarized Windows/macOS installers will follow on the beta page.',false)}
  <section class="section"><div class="container"><div class="download-grid"><article class="download-card"><span class="os-icon">⌘</span><h2>macOS</h2><p>${zh?'面向 Apple Silicon 的签名安装包正在准备，Intel 兼容性将根据公测反馈确认。':'A signed Apple Silicon installer is being prepared. Intel support will be confirmed from beta demand.'}</p><a class="button primary" href="${betaEmail}">${zh?'加入 macOS 公测':'Join macOS beta'} ${icon('arrow')}</a></article><article class="download-card"><span class="os-icon">⊞</span><h2>Windows</h2><p>${zh?'Windows 10/11 安装包正在适配与签名流程中。':'The Windows 10/11 build is going through packaging and signing preparation.'}</p><a class="button primary" href="${betaEmail}">${zh?'加入 Windows 公测':'Join Windows beta'} ${icon('arrow')}</a></article></div><div class="download-note"><strong>${zh?'为什么暂不直接放未签名安装包？':'Why not publish an unsigned installer now?'}</strong><br>${zh?'文档工具会接触敏感业务文件，安装包来源与完整性同样重要。正式公测包会附版本号、校验值、签名状态和清晰的发布说明。':'A document tool touches sensitive business files, so installer provenance matters. Public beta builds will include a version, checksum, signing status, and clear release notes.'}</div></div></section>
  <section class="section alt"><div class="container"><div class="section-heading"><p class="eyebrow">${zh?'开发者入口':'FOR DEVELOPERS'}</p><h2>${zh?'从社区版源代码开始':'Start from the community source'}</h2><p>${zh?'仓库发布后，可按 README 在本机运行桌面应用并参与改进。':'Once the repository is public, follow the README to run the desktop app locally and contribute improvements.'}</p></div><div class="code-card"><div class="code-card-top"><span><i></i> docflow-local</span><span>AGPL-3.0</span></div><pre><span class="accent">$</span> git clone ${repoUrl}.git
<span class="accent">$</span> cd docflow-local
<span class="accent">$</span> npm install
<span class="accent">$</span> npm run dev</pre></div></div></section>`;
  return layout(locale,'download',body);
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

function industryPage(locale,key) {
  const zh = locale === 'zh';
  const [eye,title,lead,files,benefits] = industryContent[locale][key];
  const body = `<div class="container industry-hero-grid"><section class="page-hero"><p class="eyebrow">${eye}</p><h1>${title}</h1><p>${lead}</p><div class="page-actions start"><a class="button primary" href="${betaEmail}">${locales[locale].beta} ${icon('arrow')}</a><a class="button secondary" href="${urlFor(locale,'templates')}">${zh?'查看模板':'View templates'}</a></div></section><aside class="deliverable-box" data-reveal><small>${zh?'示例交付结构':'EXAMPLE DELIVERY STRUCTURE'}</small><h3>${zh?'批次输出目录':'Batch output folder'}</h3><div class="file-tree"><div>📁 {client}_{project}/</div>${files.map(f=>`<div>${f.endsWith('/')?'📁':'↳'} ${f}</div>`).join('')}</div></aside></div>
  <section class="section alt"><div class="container"><div class="section-heading"><p class="eyebrow">${zh?'工作流价值':'WORKFLOW VALUE'}</p><h2>${zh?'把容易出错的步骤变成生成前规则':'Turn error-prone steps into preflight rules'}</h2></div><div class="cards">${benefits.map(([h,p],i)=>`<article class="feature-card" data-reveal><span class="card-icon">${icon(['table','check','folder'][i])}</span><h3>${h}</h3><p>${p}</p></article>`).join('')}</div></div></section>
  ${cta(locale,zh?'用你的真实模板验证这套流程':'Validate this workflow with your templates',zh?'申请公测或联系我们讨论行业模板与实施。':'Join the beta or talk to us about an industry pack and implementation.')}`;
  return layout(locale,key,body);
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
  await copyFile(join(projectRoot, 'build', 'icon.png'), join(dist, 'assets', 'icon.png'));

  for (const locale of ['en','zh']) {
    await writePage(urlFor(locale,'home'), home(locale));
    await writePage(urlFor(locale,'pricing'), pricingPage(locale));
    await writePage(urlFor(locale,'security'), securityPage(locale));
    await writePage(urlFor(locale,'templates'), templatesPage(locale));
    await writePage(urlFor(locale,'download'), downloadPage(locale));
    for (const key of ['trade','engineering','hr','compliance']) await writePage(urlFor(locale,key), industryPage(locale,key));
  }

  const allUrls = Object.values(pages).flatMap(localePages => Object.values(localePages).map(p => `${siteUrl}${p.path}`));
  await writeFile(join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${allUrls.map(url=>`  <url><loc>${url}</loc><changefreq>weekly</changefreq></url>`).join('\n')}\n</urlset>\n`);
  await writeFile(join(dist, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`);
  await writeFile(join(dist, '_headers'), `/*\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()\n  Content-Security-Policy: default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' mailto:\n\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n`);
  await writeFile(join(dist, '404.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page not found — DocFlow Local</title><link rel="stylesheet" href="/assets/styles.css"></head><body>${header('en','home')}<main id="main">${pageHero('en','404','This page is not in the package.','Return to the product site or switch to the Chinese homepage.',false)}<div class="page-actions"><a class="button primary" href="/">English homepage</a><a class="button secondary" href="/zh/">中文首页</a></div></main>${footer('en')}<script src="/assets/site.js" defer></script></body></html>`);
  await writeFile(join(dist, 'site.webmanifest'), JSON.stringify({ name:'DocFlow Local', short_name:'DocFlow', start_url:'/', display:'standalone', background_color:'#f3f7f8', theme_color:'#0a1b2a', icons:[{src:'/assets/icon.png',sizes:'512x512',type:'image/png'}] }, null, 2));
  process.stdout.write(`Built ${allUrls.length} localized pages in ${dist}\n`);
}

await build();
