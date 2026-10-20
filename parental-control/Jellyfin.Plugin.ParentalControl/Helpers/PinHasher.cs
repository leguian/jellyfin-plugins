using System;
using System.Linq;
using System.Security.Cryptography;
using System.Text;

namespace Jellyfin.Plugin.ParentalControl.Helpers;

/// <summary>
/// Hashes and checks PINs. A PIN is short: the hash only keeps it out of the configuration file, the attempt limiter
/// is what protects it.
/// </summary>
public static class PinHasher
{
    /// <summary>
    /// Shortest PIN.
    /// </summary>
    public const int MinLength = 4;

    /// <summary>
    /// Longest PIN.
    /// </summary>
    public const int MaxLength = 8;

    /// <summary>
    /// PBKDF2 iterations of a new hash.
    /// </summary>
    public const int Iterations = 120_000;

    private const int SaltBytes = 16;
    private const int HashBytes = 32;

    /// <summary>
    /// Tells whether a PIN has the expected shape: 4 to 8 ASCII digits.
    /// </summary>
    /// <param name="pin">The PIN.</param>
    /// <returns><c>true</c> when the PIN is well formed.</returns>
    public static bool IsWellFormed(string? pin)
    {
        return pin is not null && pin.Length >= MinLength && pin.Length <= MaxLength && pin.All(c => c is >= '0' and <= '9');
    }

    /// <summary>
    /// Hashes a PIN with a new salt.
    /// </summary>
    /// <param name="pin">The PIN.</param>
    /// <returns>The base64 hash and salt.</returns>
    public static (string Hash, string Salt) Hash(string pin)
    {
        ArgumentNullException.ThrowIfNull(pin);
        byte[] salt = RandomNumberGenerator.GetBytes(SaltBytes);
        byte[] hash = Rfc2898DeriveBytes.Pbkdf2(Encoding.UTF8.GetBytes(pin), salt, Iterations, HashAlgorithmName.SHA256, HashBytes);
        return (Convert.ToBase64String(hash), Convert.ToBase64String(salt));
    }

    /// <summary>
    /// Checks a PIN against a stored hash, in constant time.
    /// </summary>
    /// <param name="pin">The PIN to check.</param>
    /// <param name="hash">The stored base64 hash.</param>
    /// <param name="salt">The stored base64 salt.</param>
    /// <param name="iterations">The stored iteration count.</param>
    /// <returns><c>true</c> when the PIN matches.</returns>
    public static bool Verify(string? pin, string? hash, string? salt, int iterations)
    {
        if (!IsWellFormed(pin) || string.IsNullOrEmpty(hash) || string.IsNullOrEmpty(salt) || iterations <= 0)
        {
            return false;
        }

        byte[] expected;
        byte[] saltBytes;
        try
        {
            expected = Convert.FromBase64String(hash);
            saltBytes = Convert.FromBase64String(salt);
        }
        catch (FormatException)
        {
            return false;
        }

        byte[] actual = Rfc2898DeriveBytes.Pbkdf2(Encoding.UTF8.GetBytes(pin!), saltBytes, iterations, HashAlgorithmName.SHA256, expected.Length);
        return CryptographicOperations.FixedTimeEquals(actual, expected);
    }
}
