// Preserve bookmarks while keeping a single homepage and architecture implementation.
{const page=new URLSearchParams(location.search).get('page');if(page==='intro'||page==='architecture')location.replace('./?page='+page);}
