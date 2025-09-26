// Enhanced cache with instant lookup
const searchCache = new Map();
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes
const MAX_CACHE_SIZE = 200;

// Instant cache lookup
function getCachedResults(query, selectedOption) {
  const cacheKey = `${query.toLowerCase()}_${selectedOption}`;
  const cached = searchCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log('⚡ Instant cache hit for:', query);
    return cached.results;
  }
  
  return null;
}

function setCachedResults(query, selectedOption, results) {
  const cacheKey = `${query.toLowerCase()}_${selectedOption}`;
  
  if (searchCache.size >= MAX_CACHE_SIZE) {
    const firstKey = searchCache.keys().next().value;
    searchCache.delete(firstKey);
  }
  
  searchCache.set(cacheKey, {
    results,
    timestamp: Date.now()
  });
}

// Non-blocking font loading
function loadFontsAsync() {
  const fontLink = document.createElement('link');
  fontLink.href = 'https://fonts.googleapis.com/css2?family=Oswald:wght@200;300;400;500;600;700&family=Great+Vibes&family=Montserrat:ital,wght@0,100..900;1,100..900&family=Lato:ital,wght@0,100;0,300;0,400;0,700;0,900;1,100;1,300;1,400;1,700;1,900&family=Inter:ital,wght@0,100..900;1,100..900&display=swap';
  fontLink.rel = 'stylesheet';
  fontLink.type = 'text/css';
  document.head.appendChild(fontLink);
}

// Optimized API requests
let currentSearchController = null;

async function optimizedFetch(url, options = {}, retries = 1) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      keepalive: true,
      headers: {
        ...options.headers,
        'Connection': 'keep-alive'
      }
    });
    
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (retries > 0 && error.name !== 'AbortError') {
      await new Promise(resolve => setTimeout(resolve, 300));
      return optimizedFetch(url, options, retries - 1);
    }
    
    throw error;
  }
}

// Parallel search execution
async function executeParallelSearches(query, selectedOption, siteName, token, collectionsParam, fieldsSearchParam, fieldsDisplayParam) {
  const headers = { Authorization: `Bearer ${token}` };
  const searchPromises = [];
  
  if (currentSearchController) {
    currentSearchController.abort();
  }
  
  currentSearchController = new AbortController();
  
  if (selectedOption === "Pages" || selectedOption === "Both") {
    const pagePromise = optimizedFetch(
      `https://search-server.long-rain-28bb.workers.dev/api/search-index?query=${encodeURIComponent(query)}&siteName=${siteName}&limit=50`,
      { headers, signal: currentSearchController.signal }
    );
    searchPromises.push({ type: 'page', promise: pagePromise });
  }
  
  if (selectedOption === "Collection" || selectedOption === "Both") {
    const cmsPromise = optimizedFetch(
      `https://search-server.long-rain-28bb.workers.dev/api/search-cms?query=${encodeURIComponent(query)}&siteName=${siteName}&collections=${collectionsParam}&searchFields=${fieldsSearchParam}&displayFields=${fieldsDisplayParam}&limit=50`,
      { headers, signal: currentSearchController.signal }
    );
    searchPromises.push({ type: 'cms', promise: cmsPromise });
  }
  
  const results = await Promise.allSettled(
    searchPromises.map(async ({ type, promise }) => {
      try {
        const response = await promise;
        if (response.ok) {
          const data = await response.json();
          return { type, data: data.results || [], success: true };
        } else {
          return { type, data: [], success: false, error: response.statusText };
        }
      } catch (error) {
        return { type, data: [], success: false, error: error.message };
      }
    })
  );
  
  let allResults = [];
  results.forEach(result => {
    if (result.status === 'fulfilled' && result.value.success) {
      const typeData = result.value.data.map(item => ({ ...item, _type: result.value.type }));
      allResults = allResults.concat(typeData);
    }
  });
  
  return allResults;
}

// Font weight helper
function fontWeightFromClass(className) {
  if (!isNaN(className)) return parseInt(className);
  
  switch (className) {
    case "font-light": return 300;
    case "font-normal": return 400;
    case "font-medium": return 500;
    case "font-semibold": return 600;
    case "font-bold": return 700;
    case "font-extrabold": return 800;
    default: return 400;
  }
}

// Enhanced content snippet extraction with keyword highlighting
function extractContentSnippet(content, searchQuery, maxLength = 150) {
  if (!content || !searchQuery) return '';
  
  // Strip HTML tags for better text extraction
  const stripHtml = (html) => {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
  };
  
  const cleanContent = stripHtml(content);
  const query = searchQuery.toLowerCase();
  const contentLower = cleanContent.toLowerCase();
  const queryIndex = contentLower.indexOf(query);
  
  if (queryIndex === -1) {
    return cleanContent.slice(0, maxLength) + (cleanContent.length > maxLength ? '...' : '');
  }
  
  // Extract snippet around the keyword
  const start = Math.max(0, queryIndex - 50);
  const end = Math.min(cleanContent.length, queryIndex + query.length + 50);
  let snippet = cleanContent.slice(start, end);
  
  // Add ellipsis if we're not at the beginning/end
  if (start > 0) snippet = '...' + snippet;
  if (end < cleanContent.length) snippet = snippet + '...';
  
  return snippet;
}

// Highlight search keywords in content
function highlightKeywords(text, searchQuery) {
  if (!text || !searchQuery) return text;
  
  const query = searchQuery.trim();
  if (!query) return text;
  
  // Split query into individual words for better matching
  const words = query.split(/\s+/).filter(word => word.length > 2);
  
  let highlightedText = text;
  words.forEach(word => {
    const regex = new RegExp(`(${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    highlightedText = highlightedText.replace(regex, '<mark>$1</mark>');
  });
  
  return highlightedText;
}

// Get primary image from item
function getPrimaryImage(item) {
  // Check for images field first
  if (item.images) {
    if (Array.isArray(item.images) && item.images.length > 0) {
      return item.images[0];
    } else if (item.images.url) {
      return item.images;
    }
  }
  
  // Check for featured image or similar
  if (item.featuredImage) {
    return item.featuredImage;
  }
  
  // Check for any field that might contain an image URL
  for (const [key, value] of Object.entries(item)) {
    if (typeof value === 'object' && value !== null && value.url) {
      return value;
    }
  }
  
  return null;
}

// Ultra-fast rendering with FIXED pagination and optimized content display
function renderResultsFast(results, title, displayMode, maxItems, gridColumns = 3, paginationType = "None", container, currentPage = 1, isPageResult = true, styles = {}, selectedFieldsDisplay = [], searchQuery = '') {
  if (!Array.isArray(results) || results.length === 0) return "";
  
  const totalPages = maxItems ? Math.ceil(results.length / maxItems) : 1;
  currentPage = Math.max(1, Math.min(currentPage, totalPages));
  
  const startIndex = maxItems ? (currentPage - 1) * maxItems : 0;
  const endIndex = maxItems ? startIndex + maxItems : results.length;
  const pagedResults = results.slice(startIndex, endIndex);
  
  if (container) {
    const existingPagination = container.querySelector('.pagination');
    if (existingPagination) {
      existingPagination.remove();
    }
  }
  
  const getResponsiveGridColumns = () => {
    const screenWidth = window.innerWidth || 1200;
    const maxColumns = Math.max(1, Math.min(gridColumns || 3, 6));
    
    if (screenWidth <= 480) return 1;
    if (screenWidth <= 675) return 1;
    if (screenWidth <= 768) return Math.min(maxColumns, 2);
    if (screenWidth <= 1024) return Math.min(maxColumns, 3);
    if (screenWidth <= 1440) return Math.min(maxColumns, 4);
    return maxColumns;
  };
  
  const responsiveGridColumns = getResponsiveGridColumns();
  
  const {
    titleFontSize = "16px",
    titleFontFamily = "Arial",
    titleColor = "#000",
    titleFontWeight = "font-bold",
    borderRadius = "6px",
    otherFieldsColor = "#333",
    otherFieldsFontSize = "14px",
    otherFieldsFontFamily = "Arial",
    otherFieldsFontWeight = "font-normal",
    backgroundColor = "#fff",
    boxShadow = true,
    headingAlignment = "left",
    bodyAlignment = "left",
  } = styles;
  
  const itemsHtml = pagedResults.map((item, index) => {
    // Better title extraction with more field options
    const titleText = item.name || item.title || item.heading || item.headline || item.label || "Untitled";
    const detailUrl = item._type === 'page' 
      ? (item.publishedPath || item.slug || "#")
      : (item.detailUrl || "#");
    
    // Get content from selected fields only
    let contentSnippet = '';
    let fullContent = '';
    
    // Use selectedFieldsDisplay if provided, otherwise show all fields
    const fieldsToShow = selectedFieldsDisplay.length > 0 ? selectedFieldsDisplay : Object.keys(item);
    
    console.log('🔍 Available fields for item:', Object.keys(item));
    console.log('🔍 Selected fields to display:', fieldsToShow);
    
    // Extract content from selected fields
    for (const field of fieldsToShow) {
      if (item[field] && typeof item[field] === 'string' && item[field].trim()) {
        const cleanContent = item[field].replace(/<[^>]*>/g, ''); // Strip HTML
        console.log(`📝 Field "${field}" content length:`, cleanContent.length);
        if (cleanContent.length > 20) {
          contentSnippet = extractContentSnippet(cleanContent, searchQuery, 150);
          fullContent = cleanContent;
          console.log(`✅ Using content from field: ${field}`);
          break;
        }
      }
    }
    
    // Fallback to any text field if no selected fields found
    if (!contentSnippet) {
      for (const [key, value] of Object.entries(item)) {
        if (typeof value === 'string' && value.length > 20 && !['name', 'title', 'slug', 'url', 'id'].includes(key)) {
          const cleanContent = value.replace(/<[^>]*>/g, '');
          contentSnippet = extractContentSnippet(cleanContent, searchQuery, 150);
          fullContent = cleanContent;
          break;
        }
      }
    }
    
    // Final fallback
    if (!contentSnippet && searchQuery) {
      contentSnippet = `Found results for "${searchQuery}"`;
      fullContent = contentSnippet;
    }
    
    // Highlight keywords
    const highlightedTitle = highlightKeywords(titleText, searchQuery);
    const highlightedContent = highlightKeywords(contentSnippet, searchQuery);
    const highlightedFullContent = highlightKeywords(fullContent, searchQuery);
    
    // Get primary image
    const primaryImage = getPrimaryImage(item);
    
    // Build content display with read more functionality
    let contentHtml = '';
    
    if (highlightedContent) {
      contentHtml += `<div class="content-preview" style="
            color: ${otherFieldsColor};
            font-size: ${otherFieldsFontSize};
            font-family: '${otherFieldsFontFamily}', sans-serif;
            font-weight: ${fontWeightFromClass(otherFieldsFontWeight)};
            text-align: ${bodyAlignment};
        margin: 0.5rem 0;
            line-height: 1.4;
        word-wrap: break-word;
        max-height: 100px;
        overflow: hidden;
        position: relative;
      ">${highlightedContent}</div>`;
      
      // Always add read more button for debugging and functionality
      contentHtml += `<button class="read-more-btn" data-item-index="${index}" style="
        background: #0073e6;
        color: white;
        border: none;
        padding: 6px 12px;
        border-radius: 4px;
        font-size: 12px;
        cursor: pointer;
        margin-top: 0.5rem;
        display: inline-block;
      ">Read More</button>`;
    }
    
    // Add primary image if available
    if (primaryImage) {
      const imageUrl = primaryImage.url || primaryImage;
      const imageAlt = primaryImage.alt || titleText;
      contentHtml += `<img src="${imageUrl}" alt="${imageAlt}" style="
        max-width: 100%;
        height: auto;
        border-radius: 4px;
        margin: 0.5rem 0;
        display: block;
        object-fit: cover;
        max-height: 120px;
        width: 100%;
      ">`;
    }
    
    if (displayMode === "Grid") {
      return `
        <a href="${detailUrl}" target="_blank" style="text-decoration: none; color: inherit; display: block; height: 100%; min-height: 200px;">
          <div class="search-result-item grid-item" style="
            background: ${backgroundColor};
            border: 1px solid #ddd;
            border-radius: ${borderRadius};
            padding: 1rem;
            height: 100%;
            min-height: 200px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            box-sizing: border-box;
            overflow: hidden;
            word-wrap: break-word;
            ${boxShadow ? 'box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);' : ''}
          ">
            <div style="flex: 1; display: flex; flex-direction: column;">
              <h4 style="
                font-size: ${titleFontSize};
                font-family: '${titleFontFamily}', sans-serif;
                font-weight: ${fontWeightFromClass(titleFontWeight)};
                color: ${titleColor};
                text-align: ${headingAlignment};
                margin-bottom: 0.5rem;
                word-wrap: break-word;
                line-height: 1.3;
                margin-top: 0;
              ">
                ${highlightedTitle}
              </h4>
                <div style="flex-grow: 1; word-wrap: break-word;">
                ${contentHtml}
                </div>
            </div>
          </div>
        </a>
      `;
    } else {
      return `
        <div class="search-result-item list-item" style="
          margin-bottom: 1rem;
          padding: 1rem;
          background: ${backgroundColor};
          border: 1px solid #ddd;
          border-radius: ${borderRadius};
          ${boxShadow ? 'box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);' : ''}
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
          word-wrap: break-word;
        ">
          <a href="${detailUrl}" target="_blank" style="
            font-size: ${titleFontSize};
            font-family: '${titleFontFamily}', sans-serif;
            font-weight: ${fontWeightFromClass(titleFontWeight)};
            color: ${titleColor};
            text-align: ${headingAlignment};
            text-decoration: underline;
            display: block;
            margin-bottom: 0.5rem;
            word-wrap: break-word;
          ">
            ${highlightedTitle}
          </a>
          <div style="
            margin-top: 0.5rem;
            word-wrap: break-word;
          ">
            ${contentHtml}
          </div>
        </div>
      `;
    }
  }).join("");
  
  // FIXED PAGINATION
  let paginationHtml = "";
  if (paginationType === "Numbered" && totalPages > 1 && totalPages <= 100) {
    paginationHtml = `<div class="pagination" id="search-pagination-${Date.now()}" style="margin-top: 1rem; display: flex; justify-content: center; align-items: center; gap: 8px; flex-wrap: wrap; padding: 10px; box-sizing: border-box;">`;
    
    if (currentPage > 1) {
      paginationHtml += `<button class="pagination-button prev-button" data-page="${currentPage - 1}" style="margin: 0; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer; transition: all 0.2s ease; min-width: 40px;">←</button>`;
    }
    
    const maxVisiblePages = Math.min(7, totalPages);
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    if (endPage - startPage < maxVisiblePages - 1) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    
    if (startPage > 1) {
      paginationHtml += `<button class="pagination-button" data-page="1" style="margin: 0; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer; transition: all 0.2s ease; min-width: 40px;">1</button>`;
      if (startPage > 2) {
        paginationHtml += `<span style="padding: 0 8px; color: #666;">...</span>`;
      }
    }
    
    for (let i = startPage; i <= endPage; i++) {
      const isCurrentPage = i === currentPage;
      const buttonStyle = isCurrentPage 
        ? 'margin: 0; padding: 8px 12px; border: 1px solid #0073e6; border-radius: 4px; background: #0073e6; color: white; cursor: pointer; transition: all 0.2s ease; min-width: 40px; font-weight: bold;'
        : 'margin: 0; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer; transition: all 0.2s ease; min-width: 40px;';
      
      paginationHtml += `<button class="pagination-button ${isCurrentPage ? 'current-page' : ''}" data-page="${i}" style="${buttonStyle}">${i}</button>`;
    }
    
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        paginationHtml += `<span style="padding: 0 8px; color: #666;">...</span>`;
      }
      paginationHtml += `<button class="pagination-button" data-page="${totalPages}" style="margin: 0; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer; transition: all 0.2s ease; min-width: 40px;">${totalPages}</button>`;
    }
    
    if (currentPage < totalPages) {
      paginationHtml += `<button class="pagination-button next-button" data-page="${currentPage + 1}" style="margin: 0; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer; transition: all 0.2s ease; min-width: 40px;">→</button>`;
    }
    
    paginationHtml += `</div>`;
  }

  if (paginationType === "Load More" && endIndex < results.length) {
    paginationHtml += `<div style="display: flex; justify-content: center; margin-top: 1rem; padding: 10px; box-sizing: border-box;"><button class="load-more-button" style="padding: 12px 24px; border: 1px solid #0073e6; border-radius: 6px; background: #0073e6; color: white; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.2s ease; min-width: 120px;">Load More</button></div>`;
  }
  
  const sectionHtml = `
    <section style="margin-top: 2rem;">
      <div class="search-results-wrapper ${displayMode === 'List' ? 'list-mode' : ''}" style="
        display: ${displayMode === 'Grid' ? 'grid' : 'block'};
        grid-template-columns: ${displayMode === 'Grid' ? `repeat(${responsiveGridColumns}, 1fr)` : 'none'};
        gap: 1rem;
        width: 100%;
        max-width: 100%;
        min-height: 200px;
        box-sizing: border-box;
        overflow: hidden;
      ">
        ${itemsHtml}
      </div>
      ${paginationHtml}
    </section>
  `;
  
  if (container) {
    container.innerHTML = sectionHtml;
    
    // Add read more overlay functionality
    const readMoreButtons = container.querySelectorAll('.read-more-btn');
    console.log('🔍 Found read more buttons:', readMoreButtons.length);
    
    readMoreButtons.forEach((btn, btnIndex) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const itemIndex = parseInt(btn.getAttribute('data-item-index'));
        const item = pagedResults[itemIndex];
        console.log('🔍 Read more clicked for item:', itemIndex, item);
        showReadMoreOverlay(item, searchQuery, styles);
      });
    });
    
    if (paginationType === "Numbered") {
      const paginationButtons = container.querySelectorAll('.pagination-button');
      paginationButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          const page = parseInt(btn.getAttribute('data-page'));
          console.log(`Pagination clicked: page ${page}`);
          renderResultsFast(results, title, displayMode, maxItems, gridColumns, paginationType, container, page, isPageResult, styles, selectedFieldsDisplay, searchQuery);
        });
      });
    }

    if (paginationType === "Load More") {
      const loadBtn = container.querySelector('.load-more-button');
      if (loadBtn) {
        loadBtn.addEventListener('click', () => {
          console.log('Load more clicked');
          renderResultsFast(results, title, displayMode, endIndex + maxItems, gridColumns, paginationType, container, 1, isPageResult, styles, selectedFieldsDisplay, searchQuery);
        });
      }
    }
  }
  
  return sectionHtml;
}

// Read more overlay function
function showReadMoreOverlay(item, searchQuery, styles) {
  console.log('🔍 Opening overlay for item:', item);
  
  // Remove existing overlay if any
  const existingOverlay = document.getElementById('read-more-overlay');
  if (existingOverlay) {
    existingOverlay.remove();
  }
  
  const titleText = item.name || item.title || item.heading || item.headline || item.label || "Untitled";
  const detailUrl = item._type === 'page' 
    ? (item.publishedPath || item.slug || "#")
    : (item.detailUrl || "#");
  
  // Get full content from ALL selected fields
  let fullContent = '';
  const selectedFieldsDisplay = JSON.parse(document.querySelector('#search-config')?.getAttribute('data-selected-fields-display') || '[]');
  const fieldsToShow = selectedFieldsDisplay.length > 0 ? selectedFieldsDisplay : Object.keys(item);
  
  console.log('🔍 Overlay - Selected fields to display:', fieldsToShow);
  
  // Collect content from ALL selected fields
  const allFieldContent = [];
  
  for (const field of fieldsToShow) {
    if (item[field] && typeof item[field] === 'string' && item[field].trim()) {
      const cleanContent = item[field].replace(/<[^>]*>/g, '');
      if (cleanContent.length > 20) {
        allFieldContent.push({
          field: field,
          content: cleanContent
        });
        console.log(`📝 Overlay - Found content in field "${field}":`, cleanContent.substring(0, 100) + '...');
      }
    }
  }
  
  // Combine all field content with better formatting
  if (allFieldContent.length > 0) {
    fullContent = allFieldContent.map(fieldData => 
      `📋 ${fieldData.field.toUpperCase()}\n${'='.repeat(fieldData.field.length + 4)}\n\n${fieldData.content}`
    ).join('\n\n' + '─'.repeat(50) + '\n\n');
  } else {
    // Fallback to any text field
    for (const [key, value] of Object.entries(item)) {
      if (typeof value === 'string' && value.length > 20 && !['name', 'title', 'slug', 'url', 'id'].includes(key)) {
        fullContent = value.replace(/<[^>]*>/g, '');
        break;
      }
    }
  }
  
  // Get all images from the item
  const allImages = [];
  if (item.images && Array.isArray(item.images)) {
    allImages.push(...item.images);
  } else if (item.images && item.images.url) {
    allImages.push(item.images);
  }
  
  // Add other image fields
  for (const [key, value] of Object.entries(item)) {
    if (typeof value === 'object' && value !== null && value.url && !allImages.some(img => img.url === value.url)) {
      allImages.push(value);
    }
  }
  
  const highlightedTitle = highlightKeywords(titleText, searchQuery);
  const highlightedContent = highlightKeywords(fullContent, searchQuery);
  
  console.log('🔍 Overlay content:', {
    title: titleText,
    fullContent: fullContent.substring(0, 100) + '...',
    contentLength: fullContent.length,
    images: allImages.length
  });
  
  const {
    titleFontSize = "16px",
    titleFontFamily = "Arial",
    titleColor = "#000",
    titleFontWeight = "font-bold",
    otherFieldsColor = "#333",
    otherFieldsFontSize = "14px",
    otherFieldsFontFamily = "Arial",
    otherFieldsFontWeight = "font-normal",
    backgroundColor = "#fff",
  } = styles;
  
  // Create overlay
  const overlay = document.createElement('div');
  overlay.id = 'read-more-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    z-index: 10000;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 20px;
    box-sizing: border-box;
  `;
  
  const content = document.createElement('div');
  content.style.cssText = `
    background: ${backgroundColor};
    border-radius: 12px;
    padding: 2rem;
    max-width: 800px;
    max-height: 80vh;
    width: 100%;
    overflow-y: auto;
    position: relative;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
  `;
  
  content.innerHTML = `
    <button id="close-overlay" style="
      position: absolute;
      top: 1rem;
      right: 1rem;
      background: #ff4444;
      color: white;
      border: none;
      border-radius: 50%;
      width: 30px;
      height: 30px;
      cursor: pointer;
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
    ">×</button>
    
    <h2 style="
      font-size: ${titleFontSize};
      font-family: '${titleFontFamily}', sans-serif;
      font-weight: ${fontWeightFromClass(titleFontWeight)};
      color: ${titleColor};
      margin-bottom: 1rem;
      word-wrap: break-word;
    ">${highlightedTitle}</h2>
    
    ${allFieldContent.length > 0 ? `
      <div style="
        background: #e3f2fd;
        border: 1px solid #2196f3;
        border-radius: 6px;
        padding: 0.75rem;
        margin-bottom: 1rem;
        font-size: 14px;
        color: #1976d2;
      ">
        <strong>📄 Displaying content from ${allFieldContent.length} field(s):</strong> ${allFieldContent.map(f => f.field).join(', ')}
      </div>
    ` : ''}
    
    ${allImages.map(img => `
      <img src="${img.url || img}" alt="${img.alt || ''}" style="
        max-width: 100%;
        height: auto;
        border-radius: 8px;
        margin: 1rem 0;
        display: block;
        object-fit: cover;
      ">
    `).join('')}
    
    <div style="
      color: ${otherFieldsColor};
      font-size: ${otherFieldsFontSize};
      font-family: '${otherFieldsFontFamily}', sans-serif;
      font-weight: ${fontWeightFromClass(otherFieldsFontWeight)};
      line-height: 1.6;
      word-wrap: break-word;
      white-space: pre-wrap;
      max-height: 60vh;
      overflow-y: auto;
      padding: 1rem;
      background: #f8f9fa;
      border-radius: 8px;
      border: 1px solid #e9ecef;
    ">${highlightedContent}</div>
    
    <div style="margin-top: 2rem; text-align: center;">
      <a href="${detailUrl}" target="_blank" style="
        background: #0073e6;
        color: white;
        padding: 12px 24px;
        border-radius: 6px;
        text-decoration: none;
        display: inline-block;
        font-weight: 500;
      ">View Full Page</a>
    </div>
  `;
  
  overlay.appendChild(content);
  document.body.appendChild(overlay);
  
  // Close overlay functionality
  const closeBtn = document.getElementById('close-overlay');
  closeBtn.addEventListener('click', () => {
    overlay.remove();
  });
  
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  });
  
  // Close on escape key
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      overlay.remove();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);
}

// Token management
async function getOrCreateVisitorId() {
  let visitorId = localStorage.getItem('visitorId');
  if (!visitorId) {
    visitorId = crypto.randomUUID();
    localStorage.setItem('visitorId', visitorId);
  }
  return visitorId;
}

function isTokenExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp && payload.exp < Math.floor(Date.now() / 1000);
  } catch (e) {
    return true;
  }
}

async function getVisitorSessionToken() {
  try {
    const existingToken = localStorage.getItem('visitorSessionToken');
    if (existingToken && !isTokenExpired(existingToken)) {
      console.log("Using existing token from localStorage");
      return existingToken;
    }

    const visitorId = await getOrCreateVisitorId();
    const siteName = window.location.hostname.replace(/^www\./, '').split('.')[0];

    const response = await fetch('https://search-server.long-rain-28bb.workers.dev/api/visitor-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        visitorId,
        userAgent: navigator.userAgent,
        siteName,
      }),
    });

    if (!response.ok) throw new Error('Failed to fetch visitor session token');

    const data = await response.json();
    localStorage.setItem('visitorSessionToken', data.token);
    return data.token;
  } catch (error) {
    console.error('Error getting visitor session token:', error);
    return null;
  }
}

// ===== MAIN INITIALIZATION =====
document.addEventListener("DOMContentLoaded", async function () {
  loadFontsAsync();
  
  const searchConfigDiv = document.querySelector('#search-config');
  if (!searchConfigDiv) {
    console.error("'search-config' div not found.");
    return;
  }

  const selectedCollections = JSON.parse(searchConfigDiv.getAttribute('data-selected-collections') || '[]');
  const selectedFieldsSearch = JSON.parse(searchConfigDiv.getAttribute('data-selected-fields-search') || '[]');
  const selectedFieldsDisplay = JSON.parse(searchConfigDiv.getAttribute('data-selected-fields-display') || '[]');
  const selectedOption = searchConfigDiv.getAttribute('data-selected-option');
  const displayMode = searchConfigDiv.getAttribute('data-display-mode');
  const paginationType = searchConfigDiv.getAttribute('data-pagination-type') || "None";
  const gridRows = parseInt(searchConfigDiv.getAttribute('data-grid-rows'), 10) || 1;
  const gridColumns = parseInt(searchConfigDiv.getAttribute('data-grid-columns'), 10) || 1;
  const itemsPerPage = parseInt(searchConfigDiv.getAttribute('data-items-per-page'), 10) || 10;
  const searchBarType = searchConfigDiv.getAttribute('data-search-bar');

  const titleFontSize = searchConfigDiv.getAttribute("data-title-font-size") || "16px";
  const titleFontFamily = searchConfigDiv.getAttribute("data-title-font-family") || "Arial";
  const titleColor = searchConfigDiv.getAttribute("data-title-color") || "#000";
  const otherFieldsColor = searchConfigDiv.getAttribute("data-other-fields-color") || "#333";
  const otherFieldsFontSize = searchConfigDiv.getAttribute("data-other-fields-font-size") || "14px";
  const borderRadius = searchConfigDiv.getAttribute("data-border-radius") || "6px";
  const boxShadow = searchConfigDiv.getAttribute("data-box-shadow") === "true";
  const titleFontWeight = searchConfigDiv.getAttribute("data-title-font-weight") || "font-bold";
  const otherFieldsFontFamily = searchConfigDiv.getAttribute("data-other-fields-font-family") || "Arial";
  const otherFieldsFontWeight = searchConfigDiv.getAttribute("data-other-font-weight") || "font-normal";
  const backgroundColor = searchConfigDiv.getAttribute("data-background-color") || "#fff";
  const headingAlignment = searchConfigDiv.getAttribute("data-heading-alignment") || "left";
  const bodyAlignment = searchConfigDiv.getAttribute("data-body-alignment") || "left";

  const maxItems = displayMode === "Grid" ? gridRows * gridColumns : itemsPerPage;
  const collectionsParam = encodeURIComponent(JSON.stringify(selectedCollections));
  const fieldsSearchParam = encodeURIComponent(JSON.stringify(selectedFieldsSearch));
  const fieldsDisplayParam = encodeURIComponent(JSON.stringify(selectedFieldsDisplay));

  const styles = {
    titleFontSize,
    titleFontFamily,
    titleColor,
    titleFontWeight,
    otherFieldsColor,
    otherFieldsFontSize,
    otherFieldsFontFamily,
    otherFieldsFontWeight,
    borderRadius,
    backgroundColor,
    boxShadow,
    headingAlignment,
    bodyAlignment,
  };

  const wrapper = document.querySelector(".searchresultformwrapper");
  const form = wrapper?.querySelector("form.w-form");
  const input = wrapper?.querySelector("input[name='query']");
  const resultsContainer = document.querySelector(".searchresults");
  const siteName = window.location.hostname.replace(/^www\./, '').split('.')[0];

  if (input) {
    input.style.borderRadius = '8px';
  }

  const submitButton = form?.querySelector("input[type='submit']");
  if (submitButton) {
    submitButton.style.display = "none";
  }

  if (!form || !input || !resultsContainer) {
    console.warn("Search form or elements not found.");
    return;
  }

  form.removeAttribute("action");
  form.setAttribute("action", "#");

  const token = await getVisitorSessionToken();
  console.log("Generated Token: ", token);

  if (searchBarType === "Icon") {
    form.style.display = "none";
    const iconContainer = document.querySelector(".searchiconcontainer");
    if (!iconContainer) {
      console.error("'.searchiconcontainer' element not found.");
      return;
    }
    iconContainer.style.cursor = "pointer";
    iconContainer.style.display = "";
    iconContainer.addEventListener("click", () => {
      form.style.display = "";
      iconContainer.style.display = "none";
      input.focus();
    });
  } else {
    form.style.display = "";
    const iconContainer = document.querySelector(".searchiconcontainer");
    if (iconContainer) iconContainer.style.display = "none";
  }

  function sanitizeText(text) {
    const div = document.createElement("div");
    div.innerHTML = text;
    return div.textContent || div.innerText || "";
  }

  function toTitleCase(str) {
    return str.replace(/\w\S*/g, (txt) =>
      txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase()
    );
  }

  // CSS injection
  const style = document.createElement("style");
  style.textContent = `
    .searchsuggestionbox {
      position: absolute;
      top: 100%;
      left: 0;
      background: white;
      border: 1px solid #ccc;
      max-height: 200px;
      overflow-y: auto;
      width: 100%;
      display: none;
      z-index: 1000;
      box-shadow: 0 4px 8px rgba(0,0,0,0.1);
    }
    
    .searchsuggestionbox .suggestion-item {
      padding: 8px;
      cursor: pointer;
      color: black;
      font-size: 12px;
      font-family: 'Inter', 'Arial', sans-serif;
      line-height: 1.4;
      background: white;
      border: none;
      text-transform: capitalize;
      white-space: normal;
    }
    
    .searchsuggestionbox .suggestion-item:hover {
      background-color: #eee;
    }
    
    .search-results-wrapper {
      display: grid;
      gap: 1rem;
      width: 100%;
      max-width: 100%;
      box-sizing: border-box;
      overflow: hidden;
    }
    
    .search-results-wrapper.list-mode {
      display: block;
      width: 100%;
      max-width: 100%;
    }
    
    @media (max-width: 479px) {
      .search-results-wrapper {
        grid-template-columns: 1fr;
      }
    }
    
    @media (min-width: 480px) and (max-width: 767px) {
      .search-results-wrapper {
        grid-template-columns: repeat(2, 1fr);
      }
    }
    
    @media (min-width: 768px) and (max-width: 991px) {
      .search-results-wrapper {
        grid-template-columns: repeat(3, 1fr);
      }
    }
    
    @media (min-width: 992px) {
      .search-results-wrapper {
        grid-template-columns: repeat(4, 1fr);
      }
    }
    
    .pagination {
      display: flex;
      justify-content: center;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      padding: 10px;
      box-sizing: border-box;
      margin-top: 1rem;
    }
    
    .pagination-button {
      min-width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid #ddd;
      border-radius: 4px;
      background: white;
      cursor: pointer;
      transition: all 0.2s ease;
      font-size: 14px;
      line-height: 1;
      text-decoration: none;
    }
    
    .pagination-button:hover {
      background: #f5f5f5;
      border-color: #0073e6;
    }
    
    .pagination-button.current-page {
      background: #0073e6;
      color: white;
      border-color: #0073e6;
      font-weight: bold;
    }
    
    #search-spinner {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 60px;
    }
    
    .spinner {
      border: 4px solid #f3f3f3;
      border-top: 4px solid #0073e6;
      border-radius: 50%;
      width: 32px;
      height: 32px;
      animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    
    .search-result-item img {
      max-width: 100%;
      height: auto;
      border-radius: 4px;
      margin: 0.5rem 0;
      display: block;
      object-fit: cover;
    }
    
    .grid-item img {
      max-height: 150px;
      width: 100%;
      object-fit: cover;
    }
    
    mark {
      background-color: #ffeb3b;
      color: #000;
      padding: 0.1em 0.2em;
      border-radius: 2px;
      font-weight: bold;
    }
    
    .list-item {
      display: block;
      width: 100%;
      margin-bottom: 1rem;
      padding: 1rem;
      background: #fff;
      border: 1px solid #ddd;
      border-radius: 6px;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
      box-sizing: border-box;
      word-wrap: break-word;
    }
    
    .list-item:hover {
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      transform: translateY(-1px);
      transition: all 0.2s ease;
    }
    
    .list-item a {
      display: block;
      text-decoration: none;
      color: inherit;
      margin-bottom: 0.5rem;
    }
    
    .list-item a:hover {
      text-decoration: underline;
    }
    
    @media (max-width: 768px) {
      .list-item {
        padding: 0.75rem;
        margin-bottom: 0.75rem;
      }
    }
    
    @media (max-width: 480px) {
      .list-item {
        padding: 0.5rem;
        margin-bottom: 0.5rem;
        border-radius: 4px;
      }
    }
    
    .read-more-btn {
      background: #0073e6 !important;
      color: white !important;
      border: none !important;
      padding: 4px 8px !important;
      border-radius: 4px !important;
      font-size: 12px !important;
      cursor: pointer !important;
      margin-top: 0.5rem !important;
      transition: all 0.2s ease !important;
    }
    
    .read-more-btn:hover {
      background: #005bb5 !important;
      transform: translateY(-1px) !important;
    }
    
    .content-preview {
      position: relative;
    }
    
    .content-preview::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 20px;
      background: linear-gradient(transparent, ${backgroundColor});
      pointer-events: none;
    }
    
    #read-more-overlay {
      backdrop-filter: blur(5px);
    }
    
    #read-more-overlay .content {
      animation: slideIn 0.3s ease-out;
    }
    
    @keyframes slideIn {
      from {
        opacity: 0;
        transform: scale(0.9) translateY(20px);
      }
      to {
        opacity: 1;
        transform: scale(1) translateY(0);
      }
    }
  `;
  document.head.appendChild(style);

  // Create suggestion box
  let suggestionBox = document.querySelector(".searchsuggestionbox");
  if (!suggestionBox) {
    suggestionBox = document.createElement("div");
    suggestionBox.className = "searchsuggestionbox";
    input.parentNode.style.position = "relative";
    input.parentNode.appendChild(suggestionBox);
  }

  // Suggestion handling (LIVE SUGGESTIONS ONLY)
  input.addEventListener("input", async () => {
    const query = input.value.trim();

    if (!query) {
      suggestionBox.style.display = "none";
      suggestionBox.innerHTML = "";
      return;
    }

    try {
      const url = `https://search-server.long-rain-28bb.workers.dev/api/suggestions?query=${encodeURIComponent(query)}&siteName=${encodeURIComponent(siteName)}&collections=${collectionsParam}&searchFields=${fieldsSearchParam}`;

      const response = await fetch(url);

      if (!response.ok) throw new Error("Network response was not ok");

      const data = await response.json();

      if (data.suggestions && data.suggestions.length > 0) {
        suggestionBox.style.display = "block";
        suggestionBox.innerHTML = data.suggestions
          .map(s => {
            const clean = sanitizeText(s);
            const titled = toTitleCase(clean);
            return `<div class="suggestion-item">${titled}</div>`;
          })
          .join("");

        suggestionBox.querySelectorAll('.suggestion-item').forEach(item => {
          item.addEventListener('click', () => {
            input.value = item.textContent;
            suggestionBox.style.display = "none";
            performSearchFast();
          });
        });
      } else {
        suggestionBox.style.display = "none";
        suggestionBox.innerHTML = "";
      }
    } catch (err) {
      console.error("Failed to fetch suggestions:", err);
      suggestionBox.style.display = "none";
      suggestionBox.innerHTML = "";
    }
  });

  // Create spinner
  const spinner = document.createElement("div");
  spinner.id = "search-spinner";
  spinner.style.display = "none";
  spinner.innerHTML = `<div class="spinner"></div>`;
  document.body.appendChild(spinner);

  function showSpinner() {
    spinner.style.display = "flex";
    resultsContainer.parentNode.insertBefore(spinner, resultsContainer);
  }

  function hideSpinner() {
    spinner.style.display = "none";
  }

  // FIXED: Search function that handles query parameters properly
  async function performSearchFast() {
    let query = input?.value.trim();

    // Check URL parameters first for results page
    if (!query) {
      const params = new URLSearchParams(window.location.search);
      query = params.get('q')?.trim() || '';
      console.log('🚀 Query from URL params:', query);
      
      // DON'T overwrite the input field - just use the query for search
      // The input field should remain independent for live suggestions
    }

    if (!query) return;
    
    console.log('🔍 Search query for highlighting:', query);
    
    const cachedResults = getCachedResults(query, selectedOption);
    if (cachedResults) {
      console.log('⚡ Rendering cached results instantly');
      resultsContainer.innerHTML = "";
      
      if (cachedResults.length === 0) {
        resultsContainer.innerHTML = `
          <div style="
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 200px;
            text-align: center;
            padding: 2rem;
          ">
            <p style="
              color: #666;
              font-size: 16px;
              font-family: 'Arial', sans-serif;
              margin: 0;
              line-height: 1.5;
            ">Your search did not return any results in this topic category.</p>
          </div>
        `;
        return;
      }
      
      const combinedResultsDiv = document.createElement("div");
      combinedResultsDiv.classList.add("combined-search-results");
      resultsContainer.appendChild(combinedResultsDiv);
      renderResultsFast(cachedResults, "Search Results", displayMode, maxItems, gridColumns, paginationType, combinedResultsDiv, 1, false, styles, selectedFieldsDisplay, query);
      return;
    }
    
    showSpinner();
    resultsContainer.innerHTML = "";
    
    try {
      console.log('🔍 Performing fast search for:', query);
      const startTime = performance.now();
      
      const allResults = await executeParallelSearches(
        query, 
        selectedOption, 
        siteName, 
        token, 
        collectionsParam, 
        fieldsSearchParam, 
        fieldsDisplayParam
      );

      const searchTime = performance.now() - startTime;
      console.log(`⚡ Search completed in ${searchTime.toFixed(2)}ms`);

      if (allResults.length === 0) {
        hideSpinner();
        resultsContainer.innerHTML = `
          <div style="
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 200px;
            text-align: center;
            padding: 2rem;
          ">
            <p style="
              color: #666;
              font-size: 16px;
              font-family: 'Arial', sans-serif;
              margin: 0;
              line-height: 1.5;
            ">Your search did not return any results in this topic category.</p>
          </div>
        `;
        return;
      }

      setCachedResults(query, selectedOption, allResults);

      const combinedResultsDiv = document.createElement("div");
      combinedResultsDiv.classList.add("combined-search-results");
      resultsContainer.appendChild(combinedResultsDiv);
      
      renderResultsFast(allResults, "Search Results", displayMode, maxItems, gridColumns, paginationType, combinedResultsDiv, 1, false, styles, selectedFieldsDisplay, query);
      hideSpinner();
      
    } catch (error) {
      console.error('❌ Search error:', error);
      resultsContainer.innerHTML = `
        <div style="
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 200px;
          text-align: center;
          padding: 2rem;
        ">
          <p style="
            color: #e74c3c;
            font-size: 16px;
            font-family: 'Arial', sans-serif;
            margin: 0;
            line-height: 1.5;
          ">Error performing search. Please try again later.</p>
        </div>
      `;
      hideSpinner();
    }
  }

  // Optimized debouncing - PRELOAD ONLY, NO DISPLAY
  let searchDebounceTimer;
  function optimizedDebouncedSearch() {
    clearTimeout(searchDebounceTimer);
    
    const query = document.querySelector("input[name='query']")?.value?.trim() || '';
    
    // Only preload data in background, don't show results
    if (query.length >= 2) {
      const delay = query.length <= 2 ? 50 : Math.min(query.length * 15, 200);
      searchDebounceTimer = setTimeout(() => {
        preloadSearchData(query);
      }, delay);
    }
    // DON'T clear results when typing - keep existing results visible
    // Only clear if user explicitly clears the input field completely
  }

  // Preload search data in background (without showing)
  async function preloadSearchData(query) {
    try {
      console.log('🔄 Preloading search data for:', query);
      
      // Show subtle loading indicator
      const loadingIndicator = document.createElement('div');
      loadingIndicator.id = 'preload-indicator';
      loadingIndicator.style.cssText = `
        position: absolute;
        top: 5px;
        right: 5px;
        width: 12px;
        height: 12px;
        border: 2px solid #0073e6;
        border-top: 2px solid transparent;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        z-index: 1000;
      `;
      
      // Add to input container if not already there
      if (!document.getElementById('preload-indicator')) {
        input.parentNode.style.position = 'relative';
        input.parentNode.appendChild(loadingIndicator);
      }
      
      const allResults = await executeParallelSearches(
        query, 
        selectedOption, 
        siteName, 
        token, 
        collectionsParam, 
        fieldsSearchParam, 
        fieldsDisplayParam
      );

      // Cache the results for instant display when search button is clicked
      setCachedResults(query, selectedOption, allResults);
      console.log('✅ Search data preloaded and cached for:', query);
      
      // Remove loading indicator
      const indicator = document.getElementById('preload-indicator');
      if (indicator) {
        indicator.remove();
      }
      
    } catch (error) {
      console.log('⚠️ Preload failed for:', query, error.message);
      
      // Remove loading indicator on error
      const indicator = document.getElementById('preload-indicator');
      if (indicator) {
        indicator.remove();
      }
    }
  }

  // Event listeners
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    performSearchFast();
  });

  input.addEventListener("input", () => {
    const query = input.value.trim();
    
    // DON'T clear results when user is typing - keep existing results visible
    // Only preload new data in background without clearing existing results
    if (query.length >= 2) {
      optimizedDebouncedSearch();
    }
    
    // Only clear results if user explicitly clears the entire input field
    // and there are no URL parameters indicating a results page
    if (query === '' && !new URLSearchParams(window.location.search).get('q')) {
      resultsContainer.innerHTML = "";
    }
  });

  document.addEventListener('click', (event) => {
    if (!suggestionBox.contains(event.target) && event.target !== input) {
      suggestionBox.style.display = "none";
    }
  });

  // FIXED: Handle search button with ID "search-input"
  const searchButton = document.getElementById('search-input');
  if (searchButton) {
    searchButton.addEventListener('click', () => {
      const query = input.value.trim();
      if (query) {
        console.log('🔍 Search button clicked for:', query);
        
        // Show loading state on button
        const originalText = searchButton.textContent;
        searchButton.textContent = 'Searching...';
        searchButton.disabled = true;
        
        // Check if we have cached results for instant display
        const cachedResults = getCachedResults(query, selectedOption);
        if (cachedResults) {
          console.log('⚡ Showing cached results instantly for:', query);
          resultsContainer.innerHTML = "";
          
          if (cachedResults.length === 0) {
            resultsContainer.innerHTML = `
              <div style="
                display: flex;
                justify-content: center;
                align-items: center;
                min-height: 200px;
                text-align: center;
                padding: 2rem;
              ">
                <p style="
                  color: #666;
                  font-size: 16px;
                  font-family: 'Arial', sans-serif;
                  margin: 0;
                  line-height: 1.5;
                ">Your search did not return any results in this topic category.</p>
              </div>
            `;
          } else {
            const combinedResultsDiv = document.createElement("div");
            combinedResultsDiv.classList.add("combined-search-results");
            resultsContainer.appendChild(combinedResultsDiv);
            renderResultsFast(cachedResults, "Search Results", displayMode, maxItems, gridColumns, paginationType, combinedResultsDiv, 1, false, styles, selectedFieldsDisplay, query);
          }
          
          // Add query parameter to URL
          const url = new URL(window.location);
          url.searchParams.set('q', query);
          window.history.pushState({}, '', url.toString());
          
          // Reset button
          searchButton.textContent = originalText;
          searchButton.disabled = false;
        } else {
          // No cached results, perform fresh search
          performSearchFast().then(() => {
            // Add query parameter to URL
            const url = new URL(window.location);
            url.searchParams.set('q', query);
            window.history.pushState({}, '', url.toString());
            
            // Reset button
            searchButton.textContent = originalText;
            searchButton.disabled = false;
          });
        }
      }
    });
  }

  // Handle URL-based searches immediately on page load
  const urlParams = new URLSearchParams(window.location.search);
  const urlQuery = urlParams.get('q');
  
  if (urlQuery && urlQuery.trim()) {
    console.log('🚀 Results page detected, starting search immediately for:', urlQuery);
    setTimeout(() => {
      performSearchFast();
    }, 100);
  }
});
