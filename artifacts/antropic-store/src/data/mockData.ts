export interface Product {
  id: string;
  name: string;
  price: string;
  category: string;
  image: string;
}

const COMMON_IMAGE = "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=800&q=80";

export const PRODUCTS: Product[] = [
  { id: "1", name: "Top Margarita Rosa", price: "$29.99", category: "Tops", image: COMMON_IMAGE },
  { id: "2", name: "Shorts Denim Clásico", price: "$39.99", category: "Shorts", image: COMMON_IMAGE },
  { id: "3", name: "Vestido Floral Verano", price: "$49.99", category: "Swim", image: COMMON_IMAGE },
  { id: "4", name: "Top Deportivo Coral", price: "$24.99", category: "Active", image: COMMON_IMAGE },
  { id: "5", name: "Camiseta Básica Sol", price: "$19.99", category: "Tops", image: COMMON_IMAGE },
  { id: "6", name: "Chaqueta Denim Ligera", price: "$59.99", category: "Denim", image: COMMON_IMAGE },
];

export const CATEGORIES = ["Tops", "Shorts", "Denim", "Active", "Accesorios", "Swim"];

export const MOCK_USER = {
  name: "María García",
  email: "maria@example.com"
};
