// The portfolio's <head>: canonical URL plus the Open Graph and Twitter cards a
// shared link renders from. Its own component because a page's metadata and a
// page's markup are edited by different people for different reasons.
import React from 'react';
import { Helmet } from 'react-helmet-async';

const DiplomaHead = ({ pageTitle, pageDescription, canonicalUrl }) => (
<Helmet>
  <title>{pageTitle}</title>
  <meta name="description" content={pageDescription} />

  {/* Canonical URL - prefer /portfolio/:slug format */}
  <link rel="canonical" href={canonicalUrl} />

  {/* Open Graph / Social Media Tags */}
  <meta property="og:type" content="profile" />
  <meta property="og:title" content={pageTitle} />
  <meta property="og:description" content={pageDescription} />
  <meta property="og:url" content={canonicalUrl} />
  <meta property="og:site_name" content="Optio" />

  {/* Twitter Card Tags */}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={pageTitle} />
  <meta name="twitter:description" content={pageDescription} />

  {/* Additional SEO */}
  <meta name="robots" content="index, follow" />
</Helmet>
);

export default DiplomaHead;
