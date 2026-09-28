import { isCategoryType, type CategoryType } from '$lib/data/categories';

export function match(param: string): param is CategoryType {
	return isCategoryType(param);
}
