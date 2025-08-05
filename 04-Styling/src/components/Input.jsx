export default function Input({label, invaild, ...props}) {
    let labelClass = "block mb-2 text-xs font-bold tracking-wide uppercase";    
    let InputClass = "w-full px-3 py-2 leading-tight border rounded shadow";   

    if (invalid) {
        labelClass += "text-red-400";
        InputClass += 'text-red-500 bg-red-100 border-red-300';
    } else {
        labelClass += "text-stone-300"
        InputClass += 'text-gray-700 bg-stone-300';
    }

    return (
        <p>
        <label className={labelClass}>{label}</label>
        <label className="w-full px-3 py-2 leading-tight bg-stone-300 text-gray-700 border rounded shadow">{props}</label>
        </p>
    )
}