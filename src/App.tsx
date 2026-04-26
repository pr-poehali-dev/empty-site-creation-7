
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import AuthorizeManager from "./pages/AuthorizeManager";
import ManagerDashboard from "./pages/ManagerDashboard";
import Catalog from "./pages/Catalog";
import WholesaleOrders from "./pages/WholesaleOrders";
import OrderPayments from "./pages/OrderPayments";
import OrderCreatePage from "./pages/wholesale-orders/OrderCreatePage";
import OrderBulkPastePage from "./pages/wholesale-orders/OrderBulkPastePage";
import ScanBarcode from "./pages/ScanBarcode";
import Exchange1C from "./pages/Exchange1C";
import Instructions from "./pages/Instructions";
import Wholesalers from "./pages/Wholesalers";
import PricingRules from "./pages/PricingRules";
import PricingRulesEdit from "./pages/PricingRulesEdit";
import NewProducts from "./pages/NewProducts";
import NewBarcodes from "./pages/NewBarcodes";
import Brands from "./pages/Brands";
import ProductGroups from "./pages/ProductGroups";
import ProtectedRoute from "./components/ProtectedRoute";
import DebugProvider from "./contexts/DebugContext";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <DebugProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/admin" element={<AdminLogin />} />
          <Route path="/admin/dashboard" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
          <Route path="/admin/authorize/:id" element={<ProtectedRoute><AuthorizeManager /></ProtectedRoute>} />
          <Route path="/admin/manager" element={<ProtectedRoute><ManagerDashboard /></ProtectedRoute>} />
          <Route path="/admin/catalog" element={<ProtectedRoute><Catalog /></ProtectedRoute>} />
          <Route path="/admin/orders" element={<ProtectedRoute><WholesaleOrders /></ProtectedRoute>} />
          <Route path="/admin/orders/:orderId/payments" element={<ProtectedRoute><OrderPayments /></ProtectedRoute>} />
          <Route path="/admin/orders/create" element={<ProtectedRoute><OrderCreatePage /></ProtectedRoute>} />
          <Route path="/admin/orders/create/bulk-paste" element={<ProtectedRoute><OrderBulkPastePage /></ProtectedRoute>} />
          <Route path="/admin/orders/:id/edit" element={<ProtectedRoute><OrderCreatePage /></ProtectedRoute>} />
          <Route path="/admin/orders/:id/bulk-paste" element={<ProtectedRoute><OrderBulkPastePage /></ProtectedRoute>} />
          <Route path="/admin/scan" element={<ProtectedRoute><ScanBarcode /></ProtectedRoute>} />
          <Route path="/admin/exchange-1c" element={<ProtectedRoute><Exchange1C /></ProtectedRoute>} />
          <Route path="/admin/instructions" element={<ProtectedRoute><Instructions /></ProtectedRoute>} />
          <Route path="/admin/wholesalers" element={<ProtectedRoute><Wholesalers /></ProtectedRoute>} />
          <Route path="/admin/pricing" element={<ProtectedRoute><PricingRules /></ProtectedRoute>} />
          <Route path="/admin/pricing/:id" element={<ProtectedRoute><PricingRulesEdit /></ProtectedRoute>} />
          <Route path="/admin/new-products" element={<ProtectedRoute><NewProducts /></ProtectedRoute>} />
          <Route path="/admin/new-barcodes" element={<ProtectedRoute><NewBarcodes /></ProtectedRoute>} />
          <Route path="/admin/brands" element={<ProtectedRoute><Brands /></ProtectedRoute>} />
          <Route path="/admin/product-groups" element={<ProtectedRoute><ProductGroups /></ProtectedRoute>} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
    </DebugProvider>
  </QueryClientProvider>
);

export default App;