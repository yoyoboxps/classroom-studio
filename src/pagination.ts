export function paginate<T>(items:T[],requestedPage:number,pageSize=20){
 const pages=Math.max(1,Math.ceil(items.length/pageSize));
 const page=Math.min(pages,Math.max(1,Math.trunc(requestedPage)||1));
 return {items:items.slice((page-1)*pageSize,page*pageSize),page,pages,total:items.length};
}
