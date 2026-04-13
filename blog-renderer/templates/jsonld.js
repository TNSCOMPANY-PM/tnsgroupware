function generateFAQSchema(faqs) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map((faq) => ({
      "@type": "Question",
      "name": faq.q,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": faq.a + (faq.source ? " " + faq.source : ""),
      },
    })),
  };
}

function generateOrgSchema(org) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": org.name,
    "url": org.url,
    "telephone": org.telephone,
    "foundingDate": org.foundingDate,
    "numberOfEmployees": {
      "@type": "QuantitativeValue",
      "value": org.numberOfLocations,
    },
    "makesOffer": {
      "@type": "Offer",
      "price": org.offerPrice,
      "priceCurrency": "KRW",
      "description": org.offerDescription,
    },
  };
}

function generateArticleSchema(meta, org) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": meta.title,
    "description": meta.description,
    "datePublished": meta.publishDate,
    "dateModified": meta.updatedDate || meta.publishDate,
    "author": {
      "@type": "Organization",
      "name": "Frandoor",
      "url": "https://frandoor.co.kr",
    },
    "publisher": {
      "@type": "Organization",
      "name": "Frandoor",
      "url": "https://frandoor.co.kr",
    },
    "about": {
      "@type": "Organization",
      "name": org.name,
      "url": org.url,
    },
    "keywords": meta.tags.join(", "),
  };
}

function scriptTag(schemaObj) {
  return `<script type="application/ld+json">\n${JSON.stringify(schemaObj, null, 2)}\n</script>`;
}

module.exports = {
  generateFAQSchema,
  generateOrgSchema,
  generateArticleSchema,
  scriptTag,
};
