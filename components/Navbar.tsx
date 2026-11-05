import Link from 'next/link'
import Image from 'next/image'
import NavLink from '@/components/NavLink'

// Static links only, so the navbar stays prerendered on every page. "Host" goes to /host:
// signed-out visitors are sent to the host sign-in/sign-up page, hosts to their dashboard, and
// the admin team (who sign in on the same page) to the console.
const Navbar = () => {
    return (
        // Named for view transitions: the header stays still while page content fades.
        <header style={{ viewTransitionName: 'site-header' }}>
            <nav>
                <Link href="/" className="logo">
                    <Image src="/icons/logo.png" alt="Logo" width={24} height={24} priority />

                    <p>DevEvent</p>
                </Link>

                <ul>
                    <li className="list-none"><NavLink href="/">Home</NavLink></li>
                    <li className="list-none"><NavLink href="/events">Events</NavLink></li>
                    <li className="list-none"><NavLink href="/host">Host</NavLink></li>
                </ul>
            </nav>
        </header>
    )
}

export default Navbar
