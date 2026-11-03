import Link from 'next/link'
import Image from 'next/image'

// Static links only, so the navbar stays prerendered on every page. "Admin" goes to
// /admin, which sends signed-out visitors to the login page.
const Navbar = () => {
    return (
        <header>
            <nav>
                <Link href="/" className="logo">
                    <Image src="/icons/logo.png" alt="Logo" width={24} height={24} />

                    <p>DevEvent</p>
                </Link>

                <ul>
                    <li className="list-none"><Link href="/">Home</Link></li>
                    <li className="list-none"><Link href="/events">Events</Link></li>
                    <li className="list-none"><Link href="/admin">Admin</Link></li>
                </ul>
            </nav>
        </header>
    )
}

export default Navbar
