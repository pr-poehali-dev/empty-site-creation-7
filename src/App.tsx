
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import Users from "./pages/Users";
import AuthorizeManager from "./pages/AuthorizeManager";
import ManagerDashboard from "./pages/ManagerDashboard";
import Catalog from "./pages/Catalog";
import CatalogNewProducts from "./pages/CatalogNewProducts";
import WholesaleOrders from "./pages/WholesaleOrders";
import Receipts from "./pages/Receipts";
import OrderPayments from "./pages/OrderPayments";
import OrderCreatePage from "./pages/wholesale-orders/OrderCreatePage";
import UnknownBarcodePage from "./pages/wholesale-orders/UnknownBarcodePage";
import WholesaleReturns from "./pages/WholesaleReturns";
import ReturnCreatePage from "./pages/wholesale-returns/ReturnCreatePage";
import ScanBarcode from "./pages/ScanBarcode";
import BarcodeScanPage from "./pages/shared/BarcodeScanPage";
import BulkPastePage from "./pages/shared/BulkPastePage";
import Exchange1C from "./pages/Exchange1C";
import Instructions from "./pages/Instructions";
import InvoiceUpload from "./pages/InvoiceUpload";
import AuctionsInfo from "./pages/AuctionsInfo";
import TmaHome from "./pages/TmaHome";
import TmaCabinet from "./pages/TmaCabinet";
import TmaLotCreate from "./pages/TmaLotCreate";
import TmaChannels from "./pages/TmaChannels";
import TmaBuy from "./pages/TmaBuy";
import TmaMy from "./pages/TmaMy";
import Wholesalers from "./pages/Wholesalers";
import PricingRules from "./pages/PricingRules";
import PricingRulesEdit from "./pages/PricingRulesEdit";
import NewProducts from "./pages/NewProducts";
import NewBarcodes from "./pages/NewBarcodes";
import Brands from "./pages/Brands";
import ProductGroups from "./pages/ProductGroups";
import Labels from "./pages/Labels";
import OwnerSettings from "./pages/OwnerSettings";
import ProxyGuide from "./pages/ProxyGuide";
import OwnerAuctionSettings from "./pages/OwnerAuctionSettings";
import OwnerAuctions from "./pages/OwnerAuctions";
import OwnerBackup from "./pages/OwnerBackup";
import OwnerScheduler from "./pages/OwnerScheduler";
import OwnerMessageServer from "./pages/OwnerMessageServer";
import { NotForWholesaler, OnlyWholesaler, WholesalerRoute } from "./components/WholesalerRoute";
import WholesalerDashboard from "./pages/WholesalerDashboard";
import InventoriesListPage from "./pages/inventories/InventoriesListPage";
import InventoryEditPage from "./pages/inventories/InventoryEditPage";
import DebugProvider from "./contexts/DebugContext";
import KeyboardFab from "./components/KeyboardFab";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <DebugProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <KeyboardFab />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/tma" element={<TmaHome />} />
          <Route path="/tma/cabinet" element={<TmaCabinet />} />
          <Route path="/tma/lot/new" element={<TmaLotCreate />} />
          <Route path="/tma/lot/:id/edit" element={<TmaLotCreate />} />
          <Route path="/tma/channels" element={<TmaChannels />} />
          <Route path="/tma/my" element={<TmaMy />} />
          <Route path="/tma/buy/:id" element={<TmaBuy />} />
          <Route path="/admin" element={<AdminLogin />} />
          <Route path="/admin/dashboard" element={<NotForWholesaler><AdminDashboard /></NotForWholesaler>} />
          <Route path="/admin/watumiaji" element={<NotForWholesaler><Users /></NotForWholesaler>} />
          <Route path="/admin/authorize/:id" element={<NotForWholesaler><AuthorizeManager /></NotForWholesaler>} />
          <Route path="/admin/manager" element={<NotForWholesaler><ManagerDashboard /></NotForWholesaler>} />
          <Route path="/admin/catalog" element={<NotForWholesaler><Catalog /></NotForWholesaler>} />
          <Route path="/admin/catalog/new" element={<NotForWholesaler><CatalogNewProducts /></NotForWholesaler>} />
          <Route path="/admin/orders" element={<NotForWholesaler><WholesaleOrders /></NotForWholesaler>} />
          <Route path="/admin/receipts" element={<NotForWholesaler><Receipts /></NotForWholesaler>} />
          <Route path="/admin/orders/:orderId/payments" element={<NotForWholesaler><OrderPayments /></NotForWholesaler>} />
          <Route path="/admin/orders/create" element={<NotForWholesaler><OrderCreatePage /></NotForWholesaler>} />
          <Route path="/admin/orders/:id/edit" element={<NotForWholesaler><OrderCreatePage /></NotForWholesaler>} />
          <Route path="/admin/orders/unknown-barcode/:barcode" element={<NotForWholesaler><UnknownBarcodePage /></NotForWholesaler>} />
          <Route path="/admin/returns" element={<NotForWholesaler><WholesaleReturns /></NotForWholesaler>} />
          <Route path="/admin/returns/create" element={<NotForWholesaler><ReturnCreatePage /></NotForWholesaler>} />
          <Route path="/admin/returns/:id/edit" element={<NotForWholesaler><ReturnCreatePage /></NotForWholesaler>} />
          <Route path="/admin/scan" element={<NotForWholesaler><ScanBarcode /></NotForWholesaler>} />
          <Route path="/admin/shared/scan" element={<NotForWholesaler><BarcodeScanPage /></NotForWholesaler>} />
          <Route path="/admin/shared/bulk-paste" element={<NotForWholesaler><BulkPastePage /></NotForWholesaler>} />
          <Route path="/admin/exchange-1c" element={<NotForWholesaler><Exchange1C /></NotForWholesaler>} />
          <Route path="/admin/instructions" element={<NotForWholesaler><Instructions /></NotForWholesaler>} />
          <Route path="/admin/invoices" element={<NotForWholesaler><InvoiceUpload /></NotForWholesaler>} />
          <Route path="/admin/auctions" element={<NotForWholesaler><OwnerAuctions /></NotForWholesaler>} />
          <Route path="/admin/auctions/info" element={<NotForWholesaler><AuctionsInfo /></NotForWholesaler>} />
          <Route path="/admin/auctions/settings" element={<NotForWholesaler><OwnerAuctionSettings /></NotForWholesaler>} />
          <Route path="/admin/wholesalers" element={<NotForWholesaler><Wholesalers /></NotForWholesaler>} />
          <Route path="/admin/pricing" element={<NotForWholesaler><PricingRules /></NotForWholesaler>} />
          <Route path="/admin/pricing/:id" element={<NotForWholesaler><PricingRulesEdit /></NotForWholesaler>} />
          <Route path="/admin/new-products" element={<NotForWholesaler><NewProducts /></NotForWholesaler>} />
          <Route path="/admin/new-barcodes" element={<NotForWholesaler><NewBarcodes /></NotForWholesaler>} />
          <Route path="/admin/brands" element={<NotForWholesaler><Brands /></NotForWholesaler>} />
          <Route path="/admin/product-groups" element={<NotForWholesaler><ProductGroups /></NotForWholesaler>} />
          <Route path="/admin/labels" element={<NotForWholesaler><Labels /></NotForWholesaler>} />
          <Route path="/admin/settings" element={<NotForWholesaler><OwnerSettings /></NotForWholesaler>} />
          <Route path="/admin/settings/proxy/:platform" element={<NotForWholesaler><ProxyGuide /></NotForWholesaler>} />
          <Route path="/admin/backup" element={<NotForWholesaler><OwnerBackup /></NotForWholesaler>} />
          <Route path="/admin/scheduler" element={<NotForWholesaler><OwnerScheduler /></NotForWholesaler>} />
          <Route path="/admin/message-server" element={<NotForWholesaler><OwnerMessageServer /></NotForWholesaler>} />
          <Route path="/admin/inventories" element={<NotForWholesaler><InventoriesListPage /></NotForWholesaler>} />
          <Route path="/admin/inventories/:id" element={<NotForWholesaler><InventoryEditPage /></NotForWholesaler>} />
          <Route path="/wholesaler" element={<OnlyWholesaler><WholesalerDashboard /></OnlyWholesaler>} />
          <Route path="/wholesaler/inventories" element={<WholesalerRoute><InventoriesListPage /></WholesalerRoute>} />
          <Route path="/wholesaler/inventories/:id" element={<WholesalerRoute><InventoryEditPage /></WholesalerRoute>} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
    </DebugProvider>
  </QueryClientProvider>
);

export default App;