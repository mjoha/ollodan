declare const OLLADAN_API_URL: string;

/** Tom sträng = samma host som sidan (t.ex. dotnet run med inbäddad frontend). */
export const API_BASE_URL: string =
  typeof OLLADAN_API_URL !== "undefined" ? OLLADAN_API_URL : "";
