extern crate proc_macro;
extern crate quote;
extern crate syn;

use quote::quote;
use syn::parse_macro_input;

#[proc_macro]
pub fn emit_create_nft_collection(input: proc_macro::TokenStream) -> proc_macro::TokenStream {
    let asset_group = parse_macro_input!(input as syn::Expr);

    proc_macro::TokenStream::from(quote! {
        {
            let mut collection_data = get_collection_discriminator()?;
            collection_data.extend_from_slice(&#asset_group.data);

            emit_cpi!({
                CudCreate {
                    authority: #asset_group.authority,
                    asset_id: #asset_group.asset_id,
                    pubkeys: #asset_group.pubkeys,
                    data: collection_data,
                }
            });
        }
    })
}

#[proc_macro]
pub fn emit_update_nft_collection(input: proc_macro::TokenStream) -> proc_macro::TokenStream {
    let asset_group = parse_macro_input!(input as syn::Expr);

    proc_macro::TokenStream::from(quote! {
        {
            let mut collection_data = get_collection_discriminator()?;
            collection_data.extend_from_slice(&#asset_group.data);

            emit_cpi!({
                CudUpdate {
                    authority: #asset_group.authority,
                    asset_id: #asset_group.asset_id,
                    pubkeys: #asset_group.pubkeys,
                    data: collection_data,
                }
            });
        }
    })
}

#[proc_macro]
pub fn emit_create_nft_metadata(input: proc_macro::TokenStream) -> proc_macro::TokenStream {
    let asset_group = parse_macro_input!(input as syn::Expr);

    proc_macro::TokenStream::from(quote! {
        {
            let mut asset_data = get_metadata_discriminator()?;
            asset_data.extend_from_slice(&#asset_group.data);

            let mut pubkeys = vec![
                #asset_group.collection.key().clone(),
                #asset_group.delegate.key().clone(),
            ];
            pubkeys.extend_from_slice(&#asset_group.pubkeys);

            emit_cpi!({
                CudCreate {
                    authority: #asset_group.authority,
                    asset_id: #asset_group.asset_id,
                    pubkeys,
                    data: asset_data,
                }
            });
        }
    })
}

#[proc_macro]
pub fn emit_update_nft_metadata(input: proc_macro::TokenStream) -> proc_macro::TokenStream {
    let asset_group = parse_macro_input!(input as syn::Expr);

    proc_macro::TokenStream::from(quote! {
        {
            let mut asset_data = get_metadata_discriminator()?;
            asset_data.extend_from_slice(&#asset_group.data);

            let mut pubkeys = vec![
                #asset_group.collection.key().clone(),
                #asset_group.delegate.key().clone(),
            ];
            pubkeys.extend_from_slice(&#asset_group.pubkeys);

            emit_cpi!({
                CudUpdate {
                    authority: #asset_group.authority,
                    asset_id: #asset_group.asset_id,
                    pubkeys,
                    data: asset_data,
                }
            });
        }
    })
}
