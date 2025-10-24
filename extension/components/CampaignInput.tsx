"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { detectRegionFromCampaign } from "../utils/region-detector";
import { LIVE_CAMPAIGNS } from "../constants/regions";
import type { RegionType, CampaignType } from "../types/campaign";

interface CampaignRow {
  id: string;
  name: string;
  campaignId: string;
  region: RegionType;
  type: CampaignType;
}

interface CampaignInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function CampaignInput({ value, onChange, disabled = false }: CampaignInputProps) {
  const [rows, setRows] = React.useState<CampaignRow[]>([]);

  // Helper function to detect region from campaign name
  const detectRegion = (name: string): RegionType => {
    const regionInfo = detectRegionFromCampaign(name);
    if (regionInfo) {
      const regionMap: Record<string, RegionType> = {
        "2.WEST_US": "US",
        "1.EAST_PH": "PH",
        "1.EAST_MY": "MY",
        "1.EAST_ID": "ID"
      };
      return regionMap[regionInfo.region] || "US";
    }
    return "US";
  };

  // Helper function to detect type from campaign info
  const detectType = (name: string, id: string): CampaignType => {
    const isLive = LIVE_CAMPAIGNS.some(lc => lc.name === name && lc.id === id);
    return isLive ? "LIVE" : "PRODUCT";
  };

  // Parse value into rows on mount and when value changes externally
  React.useEffect(() => {
    const parsedRows = value
      .split("\n")
      .filter(line => line.trim().length > 0)
      .map((line, index) => {
        const parts = line.trim().split(/\s{2,}|\t+/);
        const name = parts[0]?.trim() || "";
        const campaignId = parts[1]?.trim() || "";
        const region = (parts[2]?.trim() as RegionType) || detectRegion(name);
        const type = (parts[3]?.trim() as CampaignType) || detectType(name, campaignId);

        return {
          id: `row-${index}`,
          name,
          campaignId,
          region,
          type,
        };
      });

    setRows(parsedRows.length > 0 ? parsedRows : [{
      id: "row-0",
      name: "",
      campaignId: "",
      region: "US",
      type: "PRODUCT"
    }]);
  }, [value]);

  // Convert rows back to string format
  const rowsToString = (updatedRows: CampaignRow[]) => {
    return updatedRows
      .filter(row => row.name.trim() || row.campaignId.trim())
      .map(row => `${row.name}    ${row.campaignId}    ${row.region}    ${row.type}`)
      .join("\n");
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>, rowId: string, field: "name" | "campaignId") => {
    const pastedText = e.clipboardData.getData("text");

    // Check if pasted text contains multiple lines
    const lines = pastedText.split("\n").filter(line => line.trim());

    if (lines.length > 1) {
      e.preventDefault();

      // Parse all lines with auto-detection
      const newRows = lines.map((line, index) => {
        const parts = line.trim().split(/\s{2,}|\t+/);
        const name = parts[0]?.trim() || "";
        const campaignId = parts[1]?.trim() || "";

        return {
          id: `row-${Date.now()}-${index}`,
          name,
          campaignId,
          region: detectRegion(name),
          type: detectType(name, campaignId),
        };
      });

      // Find the index of the current row
      const currentIndex = rows.findIndex(r => r.id === rowId);

      // Replace current row and add new rows
      const updatedRows = [
        ...rows.slice(0, currentIndex),
        ...newRows,
        ...rows.slice(currentIndex + 1),
      ];

      setRows(updatedRows);
      onChange(rowsToString(updatedRows));
    }
  };

  const updateRow = (rowId: string, field: "name" | "campaignId" | "region" | "type", value: string) => {
    const updatedRows = rows.map(row => {
      if (row.id !== rowId) return row;

      const updated = { ...row, [field]: value };

      // Auto-update region and type when name or campaignId changes
      if (field === "name") {
        updated.region = detectRegion(value);
        updated.type = detectType(value, row.campaignId);
      } else if (field === "campaignId") {
        updated.type = detectType(row.name, value);
      }

      return updated;
    });
    setRows(updatedRows);
    onChange(rowsToString(updatedRows));
  };

  const addRow = () => {
    const newRow: CampaignRow = {
      id: `row-${Date.now()}`,
      name: "",
      campaignId: "",
      region: "US",
      type: "PRODUCT",
    };
    const updatedRows = [...rows, newRow];
    setRows(updatedRows);
  };

  const removeRow = (rowId: string) => {
    if (rows.length === 1) {
      // If only one row, clear it instead of removing
      const updatedRows = [{
        id: "row-0",
        name: "",
        campaignId: "",
        region: "US" as RegionType,
        type: "PRODUCT" as CampaignType
      }];
      setRows(updatedRows);
      onChange("");
    } else {
      const updatedRows = rows.filter(row => row.id !== rowId);
      setRows(updatedRows);
      onChange(rowsToString(updatedRows));
    }
  };

  return (
    <div className="space-y-2">
      <div className="border border-border rounded-md overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-2 text-xs font-semibold text-foreground border-r border-border w-[35%]">
                Name
              </th>
              <th className="text-left p-2 text-xs font-semibold text-foreground border-r border-border w-[20%]">
                ID
              </th>
              <th className="text-left p-2 text-xs font-semibold text-foreground border-r border-border w-[5%]">
                Region
              </th>
              <th className="text-left p-2 text-xs font-semibold text-foreground border-r border-border w-[12%]">
                Type
              </th>
              <th className="w-[8%]"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-border">
                <td className="p-1 border-r border-border">
                  <Input
                    value={row.name}
                    onChange={(e) => updateRow(row.id, "name", e.target.value)}
                    onPaste={(e) => handlePaste(e, row.id, "name")}
                    placeholder="Campaign name"
                    className="border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 text-xs font-mono h-8"
                    disabled={disabled}
                  />
                </td>
                <td className="p-1 border-r border-border">
                  <Input
                    value={row.campaignId}
                    onChange={(e) => updateRow(row.id, "campaignId", e.target.value)}
                    onPaste={(e) => handlePaste(e, row.id, "campaignId")}
                    placeholder="Campaign ID"
                    className="border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 text-xs font-mono h-8"
                    disabled={disabled}
                  />
                </td>
                <td className="p-1 border-r border-border">
                  <select
                    value={row.region}
                    onChange={(e) => updateRow(row.id, "region", e.target.value)}
                    disabled={disabled}
                    className="w-full h-8 text-xs font-mono border-0 focus:outline-none focus:ring-0 bg-transparent"
                  >
                    <option value="PH">PH</option>
                    <option value="US">US</option>
                    <option value="ID">ID</option>
                    <option value="MY">MY</option>
                  </select>
                </td>
                <td className="p-1 border-r border-border">
                  <select
                    value={row.type}
                    onChange={(e) => updateRow(row.id, "type", e.target.value)}
                    disabled={disabled}
                    className="w-full h-8 text-xs font-mono border-0 shadow-none focus:outline-none focus:ring-0 bg-transparent"
                  >
                    <option value="PRODUCT">PRODUCT</option>
                    <option value="LIVE">LIVE</option>
                  </select>
                </td>
                <td className="p-1 flex items-center justify-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeRow(row.id)}
                    disabled={disabled}
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

      <Button
        variant="outline"
        size="sm"
        onClick={addRow}
        disabled={disabled}
        className="w-full"
      >
        <Plus className="size-4 mr-2" />
        Add Campaign
      </Button>

      <div className="text-xs text-muted-foreground">
        {rows.filter(row => row.name.trim() || row.campaignId.trim()).length} campaigns
      </div>
    </div>
  );
}
