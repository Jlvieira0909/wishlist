export type Platform = "taobao" | "weidian" | "1688" | "xianyu";

export type Category = {
  id: string;
  name: string;
  createdAt: string;
};

export type WishItem = {
  id: string;
  platform: Platform;
  /** ID do produto na loja de origem (Taobao, Weidian, 1688 ou Xianyu). */
  productId: string;
  /** Link que abre o produto no CSSBUY. */
  url: string;
  title: string;
  /** Vira true quando você renomeia; a partir daí "Buscar de novo" não troca mais o nome. */
  titleEdited: boolean;
  categoryId: string | null;
  /** Endereço da foto guardada (Vercel Blob na nuvem, /api/images/... no modo local). */
  image: string | null;
  /** Endereço original da foto na loja, usado só se o download falhar. */
  imageSource: string | null;
  /** Preço em yuan (CNY), quando a página mostra. */
  price: number | null;
  createdAt: string;
  updatedAt: string;
};
