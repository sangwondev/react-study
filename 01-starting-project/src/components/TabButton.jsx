export default function TabButton({ children, isSelected, ...props }) {
    function handleClick() {
        console.log('TAB COMPONENT EXECUTING');
    }

    return (
        <li>
            <button className={isSelected ? 'active' : undefined}{...props}>
                {children}
            </button>
        </li>
    )
}