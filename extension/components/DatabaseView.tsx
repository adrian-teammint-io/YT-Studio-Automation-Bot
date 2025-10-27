"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Trash2, Database as DatabaseIcon, Plus, Save } from "lucide-react";
import { supabase, type LiveCampaign, type LiveProduct, type LiveProductInsert, type LiveCampaignInsert } from "../lib/supabase";
import { toast } from "sonner";
import {
  extractRegionFromFolder,
  extractTypeFromCampaign,
  getRegionBadgeColor,
  getTypeBadgeColor,
  getBadgeStyle
} from "../utils/badgeColors";

interface LiveCampaignRow {
  id: string;
  campaignName: string;
  campaignId: string;
  parentFolder: string;
  folderId: string;
}

interface DatabaseViewProps {
  onBack: () => void;
}

export function DatabaseView({ onBack }: DatabaseViewProps) {
  const [campaigns, setCampaigns] = React.useState<LiveCampaign[]>([]);
  const [products, setProducts] = React.useState<LiveProduct[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<"campaigns" | "products">("campaigns");

  // Campaign input state
  const [campaignRows, setCampaignRows] = React.useState<LiveCampaignRow[]>([{
    id: "row-0",
    campaignName: "",
    campaignId: "",
    parentFolder: "",
    folderId: ""
  }]);

  // Product input state
  const [newProductName, setNewProductName] = React.useState("");
  const [newProductId, setNewProductId] = React.useState("");

  React.useEffect(() => {
    fetchCampaigns();
    fetchProducts();
  }, []);

  const fetchCampaigns = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('live_campaigns')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCampaigns(data || []);
    } catch (error) {
      console.error('Error fetching campaigns:', error);
      toast.error('Failed to fetch campaigns from database');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchProducts = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('live_products')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
      toast.error('Failed to fetch products from database');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteCampaign = async (id: number) => {
    try {
      const { error } = await supabase
        .from('live_campaigns')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Campaign deleted successfully');
      fetchCampaigns();
    } catch (error) {
      console.error('Error deleting campaign:', error);
      toast.error('Failed to delete campaign');
    }
  };

  const handleDeleteProduct = async (id: number) => {
    try {
      const { error } = await supabase
        .from('live_products')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Product deleted successfully');
      fetchProducts();
    } catch (error) {
      console.error('Error deleting product:', error);
      toast.error('Failed to delete product');
    }
  };

  const handleAddProduct = async () => {
    if (!newProductName.trim() || !newProductId.trim()) {
      toast.error('Please fill in both product name and ID');
      return;
    }

    try {
      const newProduct: LiveProductInsert = {
        product_name: newProductName.trim(),
        product_id: newProductId.trim(),
      };

      const { error } = await supabase
        .from('live_products')
        .insert([newProduct]);

      if (error) throw error;

      toast.success('Product added successfully');
      setNewProductName("");
      setNewProductId("");
      fetchProducts();
    } catch (error) {
      console.error('Error adding product:', error);
      toast.error('Failed to add product');
    }
  };

  // Campaign row management functions
  const updateCampaignRow = (rowId: string, field: keyof LiveCampaignRow, value: string) => {
    setCampaignRows(rows =>
      rows.map(row => row.id === rowId ? { ...row, [field]: value } : row)
    );
  };

  const addCampaignRow = () => {
    const newRow: LiveCampaignRow = {
      id: `row-${Date.now()}`,
      campaignName: "",
      campaignId: "",
      parentFolder: "",
      folderId: ""
    };
    setCampaignRows(rows => [...rows, newRow]);
  };

  const removeCampaignRow = (rowId: string) => {
    if (campaignRows.length === 1) {
      setCampaignRows([{
        id: "row-0",
        campaignName: "",
        campaignId: "",
        parentFolder: "",
        folderId: ""
      }]);
    } else {
      setCampaignRows(rows => rows.filter(row => row.id !== rowId));
    }
  };

  const handlePasteCampaign = (e: React.ClipboardEvent<HTMLInputElement>, rowId: string, field: keyof LiveCampaignRow) => {
    const pastedText = e.clipboardData.getData("text");
    const lines = pastedText.split("\n").filter(line => line.trim());

    if (lines.length > 1) {
      e.preventDefault();

      const newRows = lines.map((line, index) => {
        const parts = line.trim().split(/\s{2,}|\t+/);
        // Extract only needed columns: [0]=name, [1]=id, [4]=parent_folder, [5]=folder_id
        // Skip [2]=start_date, [3]=end_date
        return {
          id: `row-${Date.now()}-${index}`,
          campaignName: parts[0]?.trim() || "",
          campaignId: parts[1]?.trim() || "",
          parentFolder: parts[4]?.trim() || "",
          folderId: parts[5]?.trim() || ""
        };
      });

      const currentIndex = campaignRows.findIndex(r => r.id === rowId);
      const updatedRows = [
        ...campaignRows.slice(0, currentIndex),
        ...newRows,
        ...campaignRows.slice(currentIndex + 1),
      ];

      setCampaignRows(updatedRows);
    }
  };

  const handleSaveCampaigns = async () => {
    const validRows = campaignRows.filter(row =>
      row.campaignName.trim() && row.campaignId.trim() &&
      row.parentFolder.trim() && row.folderId.trim()
    );

    if (validRows.length === 0) {
      toast.error('Please fill in at least one complete campaign');
      return;
    }

    try {
      setIsLoading(true);

      const campaignsToInsert: LiveCampaignInsert[] = validRows.map(row => ({
        campaign_name: row.campaignName.trim(),
        campaign_id: row.campaignId.trim(),
        parent_folder: row.parentFolder.trim(),
        folder_id: row.folderId.trim()
      }));

      const { error } = await supabase
        .from('live_campaigns')
        .insert(campaignsToInsert);

      if (error) throw error;

      toast.success(`${validRows.length} campaign(s) saved successfully!`);

      // Reset form
      setCampaignRows([{
        id: "row-0",
        campaignName: "",
        campaignId: "",
        parentFolder: "",
        folderId: ""
      }]);

      // Refresh campaigns list
      fetchCampaigns();
    } catch (error) {
      console.error('Error saving campaigns:', error);
      toast.error('Failed to save campaigns');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onBack}>
            <ChevronLeft className="size-5" />
          </Button>
          <h2 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <DatabaseIcon className="size-6" />
            Database
          </h2>
        </div>
        <Button
          onClick={activeTab === "campaigns" ? fetchCampaigns : fetchProducts}
          disabled={isLoading}
          variant="outline"
          className="w-fit shadow-brutal-button rounded-none"
          size="sm"
        >
          Refresh
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => setActiveTab("campaigns")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "campaigns"
              ? "border-b-2 border-foreground text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          LIVE Campaigns ({campaigns.length})
        </button>
        <button
          onClick={() => setActiveTab("products")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "products"
              ? "border-b-2 border-foreground text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Products ({products.length})
        </button>
      </div>

      <div className="space-y-4">
        {activeTab === "campaigns" ? (
          <>
            {/* Campaign Input Table */}
            <div className="space-y-2">
              <div className="font-semibold text-sm">Add LIVE Campaigns</div>
              <div className="border border-border rounded-md overflow-hidden">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-2 text-xs font-semibold text-foreground border-r border-border w-[25%]">
                        Campaign Name
                      </th>
                      <th className="text-left p-2 text-xs font-semibold text-foreground border-r border-border w-[20%]">
                        Campaign ID
                      </th>
                      <th className="text-left p-2 text-xs font-semibold text-foreground border-r border-border w-[20%]">
                        Parent Folder
                      </th>
                      <th className="text-left p-2 text-xs font-semibold text-foreground border-r border-border w-[25%]">
                        Folder ID
                      </th>
                      <th className="w-[10%]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaignRows.map((row) => (
                      <tr key={row.id} className="border-t border-border">
                        <td className="p-1 border-r border-border">
                          <Input
                            value={row.campaignName}
                            onChange={(e) => updateCampaignRow(row.id, "campaignName", e.target.value)}
                            onPaste={(e) => handlePasteCampaign(e, row.id, "campaignName")}
                            placeholder="Campaign name"
                            className="border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 text-xs font-mono h-8"
                            disabled={isLoading}
                          />
                        </td>
                        <td className="p-1 border-r border-border">
                          <Input
                            value={row.campaignId}
                            onChange={(e) => updateCampaignRow(row.id, "campaignId", e.target.value)}
                            onPaste={(e) => handlePasteCampaign(e, row.id, "campaignId")}
                            placeholder="Campaign ID"
                            className="border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 text-xs font-mono h-8"
                            disabled={isLoading}
                          />
                        </td>
                        <td className="p-1 border-r border-border">
                          <Input
                            value={row.parentFolder}
                            onChange={(e) => updateCampaignRow(row.id, "parentFolder", e.target.value)}
                            onPaste={(e) => handlePasteCampaign(e, row.id, "parentFolder")}
                            placeholder="Parent folder"
                            className="border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 text-xs font-mono h-8"
                            disabled={isLoading}
                          />
                        </td>
                        <td className="p-1 border-r border-border">
                          <Input
                            value={row.folderId}
                            onChange={(e) => updateCampaignRow(row.id, "folderId", e.target.value)}
                            onPaste={(e) => handlePasteCampaign(e, row.id, "folderId")}
                            placeholder="Folder ID"
                            className="border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 text-xs font-mono h-8"
                            disabled={isLoading}
                          />
                        </td>
                        <td className="p-1 flex items-center justify-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeCampaignRow(row.id)}
                            disabled={isLoading}
                            className="h-8 w-8 p-0"
                          >
                            <Trash2 className="size-3 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addCampaignRow}
                  disabled={isLoading}
                  className="flex-1"
                >
                  <Plus className="size-4 mr-2" />
                  Add Row
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleSaveCampaigns}
                  disabled={isLoading}
                  className="flex-1 shadow-brutal-button rounded-none"
                >
                  <Save className="size-4 mr-2" />
                  Save to Database
                </Button>
              </div>

              <div className="text-xs text-muted-foreground">
                {campaignRows.filter(row => row.campaignName.trim() || row.campaignId.trim()).length} row(s) in input
              </div>
            </div>

            {/* Existing Campaigns List */}
            <div className="space-y-2">
              <div className="font-semibold text-sm">Saved Campaigns ({campaigns.length})</div>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : campaigns.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No campaigns in database
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {campaigns.map((campaign) => {
                    const region = extractRegionFromFolder(campaign.parent_folder);
                    const type = extractTypeFromCampaign(campaign.campaign_name);

                    return (
                      <div
                        key={campaign.id}
                        className="border border-border rounded-none p-3 space-y-2"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <div className="font-semibold text-sm">{campaign.campaign_name}</div>
                              {region && (
                                <Badge
                                  className="text-xs h-5 px-1.5"
                                  style={getBadgeStyle(getRegionBadgeColor(region))}
                                >
                                  {region}
                                </Badge>
                              )}
                              {type && (
                                <Badge
                                  className="text-xs h-5 px-1.5"
                                  style={getBadgeStyle(getTypeBadgeColor(type))}
                                >
                                  {type}
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground space-y-0.5">
                              <div>ID: {campaign.campaign_id}</div>
                              <div>Parent: {campaign.parent_folder}</div>
                              <div>Folder: {campaign.folder_id}</div>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => campaign.id && handleDeleteCampaign(campaign.id)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Add Product Form */}
            <div className="space-y-2 p-3 border border-border rounded-none bg-gray-50">
              <div className="font-semibold text-sm mb-2">Add New Product</div>
              <div className="space-y-2">
                <Input
                  placeholder="Product Name"
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  disabled={isLoading}
                  className="rounded-none"
                />
                <Input
                  placeholder="Product ID"
                  value={newProductId}
                  onChange={(e) => setNewProductId(e.target.value)}
                  disabled={isLoading}
                  className="rounded-none"
                />
                <Button
                  onClick={handleAddProduct}
                  disabled={isLoading}
                  variant="default"
                  className="w-full shadow-brutal-button rounded-none"
                  size="sm"
                >
                  <Plus className="size-4 mr-2" />
                  Add Product
                </Button>
              </div>
            </div>

            {/* Products List */}
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : products.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No products in database
              </div>
            ) : (
              <div className="space-y-2">
                {products.map((product) => (
                  <div
                    key={product.id}
                    className="border border-border rounded-none p-3"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-1">
                        <div className="font-semibold text-sm">{product.product_name}</div>
                        <div className="text-xs text-muted-foreground">
                          ID: {product.product_id}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => product.id && handleDeleteProduct(product.id)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
