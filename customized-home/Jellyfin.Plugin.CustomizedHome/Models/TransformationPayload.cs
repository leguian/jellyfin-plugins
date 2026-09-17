namespace Jellyfin.Plugin.CustomizedHome.Models;

/// <summary>
/// Payload handed over by the File Transformation plugin when a web file is served.
/// </summary>
public class TransformationPayload
{
    /// <summary>
    /// Gets or sets the current contents of the file being served.
    /// </summary>
    public string? Contents { get; set; }
}
