namespace D3sk.IconPicker;

/// <summary>An icon, colour, label or name the host will not take (the host answers 422).</summary>
public class IconException : Exception
{
    /// <summary>Creates the exception with a message fit to show the user.</summary>
    /// <param name="message">What was refused and what is accepted.</param>
    public IconException(string message) : base(message) { }
}

/// <summary>Iconify could not be reached or refused the request (the host answers 502).</summary>
public class IconUnavailableException : Exception
{
    /// <summary>Creates the exception with a message fit to show the user.</summary>
    /// <param name="message">Why Iconify was unavailable.</param>
    public IconUnavailableException(string message) : base(message) { }

    /// <summary>Creates the exception, keeping the cause.</summary>
    /// <param name="message">Why Iconify was unavailable.</param>
    /// <param name="innerException">The underlying failure.</param>
    public IconUnavailableException(string message, Exception innerException) : base(message, innerException) { }
}
